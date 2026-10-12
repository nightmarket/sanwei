import { clamp } from "three/src/math/MathUtils.js";
import { TUNED_FPS } from "./RAF";

/** Frames per decision. Only the fastest `KEPT_SAMPLES` count, so a lone stall (a texture upload, GC)
 * doesn't cost resolution. */
const SAMPLES = 30;
const KEPT_SAMPLES = 28;
const STEP = 0.25;
/** Seconds after start-up, and after each change or pause, before frames count again. */
const STARTUP_COOLDOWN_S = 3;
const CHANGE_COOLDOWN_S = 1;
/** Seconds of on-time frames before trying the next ratio up. */
const SETTLE_S = 3;
/** A ratio that dropped frames isn't tried again for this long. */
const RETRY_S = 20;
/** Frames averaging this far over the display interval step down; under `ON_TIME` they count as settled. */
const SLOW = 1.08;
const ON_TIME = 1.02;

/**
 * Dynamic resolution: steps a canvas's pixel ratio between `min` and `max` to hold the display's refresh
 * rate, taken as the fastest frame interval seen. A ratio that drops frames steps down and isn't retried
 * for a while; one that holds steps up, so a capable device renders sharp and a struggling one trades
 * resolution for frames instead of the other way round.
 */
export class AdaptivePixelRatio {
  ratio: number;
  private cooldown = STARTUP_COOLDOWN_S;
  private failures = new Map<number, number>();
  private fastest = 1;
  private samples: number[] = [];
  private settled = 0;
  private time = 0;

  constructor(
    private readonly min: number,
    private readonly max: number,
    start: number
  ) {
    this.ratio = clamp(start, min, max);
  }

  /** Feeds one frame's `delta` in seconds. True when `ratio` changed. */
  update(delta: number) {
    this.time += delta;
    if (delta > 1 / 500) this.fastest = Math.min(this.fastest, delta);
    if (this.cooldown > 0) {
      this.cooldown -= delta;
      this.samples.length = 0;
      return false;
    }
    this.samples.push(delta);
    if (this.samples.length < SAMPLES) return false;

    const kept = this.samples.sort((a, b) => a - b).slice(0, KEPT_SAMPLES);
    this.samples.length = 0;
    const average = kept.reduce((sum, sample) => sum + sample, 0) / kept.length;
    const interval = Math.max(this.fastest, 1 / TUNED_FPS);
    if (average > interval * SLOW && this.ratio > this.min) {
      this.failures.set(this.ratio, this.time);
      return this.change(Math.max(this.min, this.ratio - STEP));
    }
    this.settled = average < interval * ON_TIME ? this.settled + average * kept.length : 0;
    const next = Math.min(this.max, this.ratio + STEP);
    const failedAt = this.failures.get(next);
    const retry = failedAt === undefined || this.time - failedAt > RETRY_S;
    return this.settled > SETTLE_S && next > this.ratio && retry && this.change(next);
  }

  /** The loop stopped (or the tab hid): the frames around it say nothing about load. */
  pause() {
    this.cooldown = CHANGE_COOLDOWN_S;
    this.samples.length = 0;
    this.settled = 0;
  }

  private change(ratio: number) {
    this.ratio = ratio;
    this.settled = 0;
    this.cooldown = CHANGE_COOLDOWN_S;
    return true;
  }
}
