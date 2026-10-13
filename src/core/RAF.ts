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
/** WebKit stamps frames in whole ms and lands them up to ~1.5 ms late. */
const JITTER_MS = 2;
/** This many deltas in a row that fit no whole number of refreshes, agreeing with each other, mean the
 * display rate changed. */
const RESEED_FRAMES = 4;
/** Smoothing on the refresh interval, refined from frames that span one refresh. */
const INTERVAL_LERP = 0.02;
/** Share of the rounding error repaid each frame. */
const DEBT_REPAY = 0.1;

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
  /** This frame in the `performance.now()` timebase that event `timeStamp`s share, stepping as evenly as
   * `time`. */
  timestamp = 0;
  /** Seconds since this callback last ran (a throttled callback's own interval), advancing in whole
   * display refreshes, at most `MAX_DELTA_S`. */
  delta = 0;
  /** `delta` in `TUNED_FPS` frames: 1 at 120 Hz, 2 at 60 Hz. */
  frames = 0;
  /** Loop frame counter. */
  frame = 0;
  /** Milliseconds per display refresh, as the loop measures it. */
  interval = 1000 / 60;
  /** Refreshes the display waited past the frame this callback last ran in; 0 when it made its refresh. */
  dropped = 0;

  /** A lerp factor tuned for one `TUNED_FPS` frame, compounded over `frames`. */
  lerpFactor(factor: number) {
    return 1 - (1 - factor) ** this.frames;
  }

  copy(other: FrameState) {
    this.time = other.time;
    this.timestamp = other.timestamp;
    this.delta = other.delta;
    this.frames = other.frames;
    this.frame = other.frame;
    this.interval = other.interval;
    this.dropped = other.dropped;
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
  /** Refreshes dropped right after its last run; null until the frame after that run starts. */
  dropped: number | null;
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

/** How far a delta may land from a whole number of refreshes and still span exactly that many. */
const tolerance = (interval: number) => Math.min(JITTER_MS, interval / 4);

/** Learns the display's refresh interval from frame timestamps and advances loop time in whole refreshes,
 * so whole-ms stamps and catch-up frames don't make steady motion step unevenly. */
class RefreshClock {
  /** Start at 60 Hz, so a device that is slow from its first frame still reads as dropping frames. */
  interval = 1000 / 60;
  /** Whole refreshes the last frame spanned. 0 on the first frame back after a reset. */
  refreshes = 0;
  /** Ms loop time owes wall time (+) or is ahead by (-), within ±`interval`. */
  debt = 0;
  /** Recent deltas in a row that fit no whole number of refreshes. */
  private misfits: number[] = [];

  /** `raw`: clamped ms since the last frame, 0 after a reset. Returns the ms the loop advances. */
  advance(raw: number) {
    if (raw === 0) {
      this.refreshes = 0;
      this.debt = 0;
      return 0;
    }
    this.learn(raw);
    // Floored, within jitter, so a late frame's leftover part of a refresh counts once, with the catch-up
    // after it, rather than rounding up and then again. Under one refresh is that catch-up; it still showed
    // on a refresh of its own.
    this.refreshes = Math.max(1, Math.floor((raw + tolerance(this.interval)) / this.interval));
    this.debt = clamp(this.debt + raw - this.refreshes * this.interval, -this.interval, this.interval);
    const repaid = this.debt * DEBT_REPAY;
    this.debt -= repaid;
    return this.refreshes * this.interval + repaid;
  }

  reset() {
    this.debt = 0;
    this.misfits.length = 0;
  }

  private learn(raw: number) {
    const n = Math.round(raw / this.interval);
    if (n >= 1 && Math.abs(raw - n * this.interval) <= tolerance(this.interval)) {
      this.misfits.length = 0;
      if (n === 1) this.interval = lerp(this.interval, raw, INTERVAL_LERP);
      return;
    }
    this.misfits.push(raw);
    if (this.misfits.length < RESEED_FRAMES) return;
    const mean = average(this.misfits);
    if (this.misfits.every((ms) => Math.abs(ms - mean) <= tolerance(mean))) {
      this.interval = mean;
      this.debt = 0;
      this.misfits.length = 0;
    } else this.misfits.shift();
  }
}

/** One shared requestAnimationFrame loop. Runs only while it has subscribers and isn't paused. */
class RAFBase {
  isSingleton = true;
  /** Time each callback for `inspect()`; the debug perf pane turns it on. */
  profiling = false;

  private subscribers: Subscriber[] = [];
  private state = new FrameState();
  private clock = new RefreshClock();
  private time = 0;
  private frame = 0;
  private lastTimestamp: number | null = null;
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
      dropped: null,
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

  /** Average cost of each callback over the last `SAMPLE_WINDOW` frames, in run order (0 ms unless
   * `profiling`). */
  inspect = (): FrameLoopEntry[] =>
    this.subscribers.map(({ label, order, fps, samples }) => ({ label, order, fps, ms: average(samples) }));

  /** `timestamp` is the frame's vsync-aligned start time. Reading `performance.now()` here instead
   * would pick up the callback's scheduling jitter, and every delta-scaled step would stutter. */
  private update = (timestamp: number) => {
    this.rafId = null;
    if (!this.playing || this.subscribers.length === 0) return;

    const raw = this.lastTimestamp === null ? 0 : clamp(timestamp - this.lastTimestamp, 0, MAX_DELTA_S * 1000);
    this.lastTimestamp = timestamp;
    const frameDelta = this.clock.advance(raw);
    this.time += frameDelta;
    this.frame++;

    const { state } = this;
    state.time = this.time;
    state.timestamp = timestamp - this.clock.debt;
    state.frame = this.frame;
    state.interval = this.clock.interval;
    // Schedule first, so the loop survives anything a callback does.
    this.rafId = requestAnimationFrame(this.update);

    for (const subscriber of this.subscribers) {
      // Only the frame right after a callback's run says whether that run made its refresh.
      subscriber.dropped ??= Math.max(0, this.clock.refreshes - 1);
      if (!subscriber.active || !this.isDue(subscriber, frameDelta)) continue;
      state.delta = clamp((this.time - subscriber.lastTime) / 1000, 0, MAX_DELTA_S);
      state.frames = state.delta * TUNED_FPS;
      state.dropped = subscriber.dropped;
      subscriber.dropped = null;
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
    this.clock.reset();
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
