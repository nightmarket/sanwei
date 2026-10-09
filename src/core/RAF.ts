// Per-file import: the root `three` entry would pull all of three.js into every page that only needs
// the frame loop.
import { clamp, lerp } from "three/src/math/MathUtils.js";

/** Per-frame factors and steps (lerps, friction, feedback) are tuned for one frame at this rate. */
export const TUNED_FPS = 120;
/** Longest step a callback sees, so a stall can't jump it arbitrarily far. Covers throttled loops
 * down to 4 fps. */
const MAX_DELTA_S = 0.25;
/** A throttled callback runs on the first frame within this of its interval, so a frame landing a
 * hair early doesn't push it a whole frame late and break its cadence. */
const INTERVAL_SLACK_MS = 1;
/** Frames of per-callback timing kept for the profiler. */
const SAMPLE_WINDOW = 60;
/** Smoothing on the measured display interval that `budget()` is measured against. */
const FRAME_INTERVAL_LERP = 0.1;

/** Execution bands within a frame; lower runs first. Input settles before anything reads it, scenes
 * render after scroll moves, and DOM chrome reads what the scenes just did. */
export const RAF_ORDER = { INPUT: -100, SCROLL: -50, SCENE: 0, UI: 100 } as const;

/** Absolute fps (`30`), or a share of the display rate (`"50%"` runs every other frame). */
export type FrameRate = number | `${number}%`;

export type SubscribeOptions = {
  /** Throttle; omitted or `null` runs every frame. */
  fps?: FrameRate | null;
  /** Sort key within a frame; see `RAF_ORDER`. */
  order?: number;
  /** Name in the profiler and in error logs. */
  label?: string;
};

/** What a frame callback sees. The loop hands one shared instance to each callback in turn, so copy
 * it (`copy`) to keep values past the callback. */
export class FrameState {
  /** Loop time in ms, excluding paused stretches and hidden tabs. */
  time = 0;
  /** Seconds since this callback last ran (a throttled callback's own interval), at most
   * `MAX_DELTA_S`. */
  delta = 0;
  /** `delta` in `TUNED_FPS` frames: 1 at 120 Hz, 2 at 60 Hz. */
  frames = 0;
  /** Loop frame counter. */
  frame = 0;

  /** A lerp factor tuned for one `TUNED_FPS` frame, compounded over `frames`. */
  lerpFactor(factor: number) {
    return 1 - (1 - factor) ** this.frames;
  }

  /** Milliseconds left before this frame overruns the display interval; gate optional work on it. */
  budget() {
    return RAF.budget();
  }

  copy(other: FrameState) {
    this.time = other.time;
    this.delta = other.delta;
    this.frames = other.frames;
    this.frame = other.frame;
    return this;
  }
}

type Subscriber = {
  callback: (state: FrameState) => void;
  order: number;
  label: string;
  fps: FrameRate | null;
  /** Absolute throttle in ms; 0 when unthrottled or relative. */
  interval: number;
  /** Relative throttle: run every Nth frame; 1 when unthrottled or absolute. */
  everyNth: number;
  accumulated: number;
  skipped: number;
  lastTime: number;
  active: boolean;
  failed: boolean;
  samples: number[];
};

export type FrameLoopEntry = { label: string; order: number; fps: FrameRate | null; ms: number };

function parseRate(fps: FrameRate | null) {
  if (typeof fps === "string") return { interval: 0, everyNth: Math.max(1, Math.round(100 / Number.parseFloat(fps))) };
  return { interval: fps ? 1000 / fps : 0, everyNth: 1 };
}

const average = (samples: number[]) => (samples.length ? samples.reduce((sum, ms) => sum + ms, 0) / samples.length : 0);

/** One shared requestAnimationFrame loop. Runs only while it has subscribers and isn't paused. */
class RAFBase {
  isSingleton = true;
  /** Time each callback for `inspect()`; the debug perf pane turns it on. */
  profiling = false;

  private subscribers: Subscriber[] = [];
  private state = new FrameState();
  private time = 0;
  private frame = 0;
  private lastTimestamp: number | null = null;
  private frameStart = 0;
  private frameInterval = 1000 / 60;
  private playing = true;
  private rafId: number | null = null;
  private initialized = false;

  init = () => {
    if (this.initialized) return;
    this.initialized = true;
    // Hidden tabs get no frames; the first frame back shouldn't count the whole gap.
    document.addEventListener("visibilitychange", this.resetClock);
  };

  destroy = () => {
    this.stop();
    document.removeEventListener("visibilitychange", this.resetClock);
    this.initialized = false;
    for (const subscriber of this.subscribers) subscriber.active = false;
    this.subscribers = [];
  };

  /** Add a frame callback; returns its unsubscribe. */
  subscribe = (
    callback: (state: FrameState) => void,
    { fps = null, order = RAF_ORDER.SCENE, label }: SubscribeOptions = {}
  ) => {
    const subscriber: Subscriber = {
      callback,
      order,
      label: label ?? (callback.name || "anonymous"),
      fps,
      ...parseRate(fps),
      accumulated: 0,
      skipped: 0,
      lastTime: this.time,
      active: true,
      failed: false,
      samples: [],
    };
    // A fresh array, so a frame already iterating the old one isn't disturbed. The sort is stable,
    // so equal orders keep subscription order.
    this.subscribers = [...this.subscribers, subscriber].sort((a, b) => a.order - b.order);
    this.init();
    this.start();
    return () => {
      if (!subscriber.active) return;
      subscriber.active = false;
      this.subscribers = this.subscribers.filter((entry) => entry !== subscriber);
      if (this.subscribers.length === 0) this.stop();
    };
  };

  /** Freeze every callback; the clock stops with them. */
  pause = () => {
    this.playing = false;
    this.stop();
  };

  play = () => {
    if (this.playing) return;
    this.playing = true;
    this.lastTimestamp = null;
    this.start();
  };

  get isPlaying() {
    return this.playing;
  }

  /** Milliseconds left before the current frame overruns the measured display interval. */
  budget = () => this.frameInterval - (performance.now() - this.frameStart);

  /** Average cost of each callback over the last `SAMPLE_WINDOW` frames, in run order (0 ms unless
   * `profiling`). */
  inspect = (): FrameLoopEntry[] =>
    this.subscribers.map(({ label, order, fps, samples }) => ({ label, order, fps, ms: average(samples) }));

  /** `timestamp` is the frame's vsync-aligned start time. Reading `performance.now()` here instead
   * would pick up the callback's scheduling jitter, and every delta-scaled step would stutter. */
  private update = (timestamp: number) => {
    this.rafId = null;
    if (!this.playing || this.subscribers.length === 0) return;

    const frameDelta =
      this.lastTimestamp === null ? 0 : clamp(timestamp - this.lastTimestamp, 0, MAX_DELTA_S * 1000);
    this.lastTimestamp = timestamp;
    this.time += frameDelta;
    this.frame++;
    if (frameDelta > 0) this.frameInterval = lerp(this.frameInterval, frameDelta, FRAME_INTERVAL_LERP);
    this.frameStart = performance.now();

    const { state } = this;
    state.time = this.time;
    state.frame = this.frame;
    // Schedule first, so the loop survives anything a callback does.
    this.rafId = requestAnimationFrame(this.update);

    for (const subscriber of this.subscribers) {
      if (!subscriber.active || !this.isDue(subscriber, frameDelta)) continue;
      state.delta = clamp((this.time - subscriber.lastTime) / 1000, 0, MAX_DELTA_S);
      state.frames = state.delta * TUNED_FPS;
      subscriber.lastTime = this.time;
      this.run(subscriber);
    }
  };

  private isDue(subscriber: Subscriber, frameDelta: number) {
    if (subscriber.everyNth > 1) {
      subscriber.skipped = (subscriber.skipped + 1) % subscriber.everyNth;
      return subscriber.skipped === 0;
    }
    if (subscriber.interval === 0) return true;
    // Carry the remainder instead of restarting from this frame, so the long-run rate is exact.
    subscriber.accumulated += frameDelta;
    if (subscriber.accumulated + INTERVAL_SLACK_MS < subscriber.interval) return false;
    subscriber.accumulated = clamp(subscriber.accumulated - subscriber.interval, 0, subscriber.interval);
    return true;
  }

  private run(subscriber: Subscriber) {
    const start = this.profiling ? performance.now() : 0;
    try {
      subscriber.callback(this.state);
    } catch (error) {
      // Logged once; the rest of the frame and later frames keep running.
      if (!subscriber.failed) console.error(`[RAF] "${subscriber.label}" threw`, error);
      subscriber.failed = true;
    }
    if (!this.profiling) return;
    subscriber.samples.push(performance.now() - start);
    if (subscriber.samples.length > SAMPLE_WINDOW) subscriber.samples.shift();
  }

  private resetClock = () => {
    this.lastTimestamp = null;
  };

  private start() {
    if (this.rafId !== null || !this.playing || this.subscribers.length === 0) return;
    this.lastTimestamp = null;
    this.rafId = requestAnimationFrame(this.update);
  }

  private stop() {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}

export const RAF = new RAFBase();
