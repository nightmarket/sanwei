import { clamp } from "three/src/math/MathUtils.js";
import type { FrameState } from "./RAF";

/** Calls per decision. */
const WINDOW = 30;
/** A window with more late calls than this steps down, so a lone stall (a texture upload, GC) doesn't
 * cost resolution. */
const SLOW = 4;
/** A window with at most this many late calls counts toward settling. */
const ON_TIME = 1;
const STEP = 0.25;
/** Seconds after start-up, and after each change or pause, before calls count again. */
const STARTUP_COOLDOWN_S = 3;
const CHANGE_COOLDOWN_S = 1;
/** Seconds of on-time calls before trying the next ratio up. */
const SETTLE_S = 3;
/** A ratio that dropped frames isn't tried again for this long. */
const RETRY_S = 20;

/** `sliding`: stepping down since `from`, after a window with `late` late calls. `holding`: a slide reached
 * `min` without halving the late calls, so `from` was put back. */
type Mode = { kind: "adapting" } | { kind: "sliding"; from: number; late: number } | { kind: "holding" };

/**
 * Dynamic resolution: steps a canvas's pixel ratio between `min` and `max` to hold the display's refresh
 * rate, counting calls whose frame missed its refresh (`FrameState.dropped`). A ratio that drops frames
 * steps down and isn't retried for a while; one that holds steps up, so a capable device renders sharp and
 * a struggling one trades resolution for frames instead of the other way round. When stepping down to `min`
 * doesn't halve the drops, resolution isn't what drops them (a busy CPU, a capped display), so it puts back
 * the ratio the slide started from and holds it until a window stops dropping.
 */
export class AdaptivePixelRatio {
  ratio: number;
  private mode: Mode = { kind: "adapting" };
  private cooldown = STARTUP_COOLDOWN_S;
  private failures = new Map<number, number>();
  private calls = 0;
  private late = 0;
  private seconds = 0;
  private settled = 0;
  private time = 0;

  constructor(
    private readonly min: number,
    private readonly max: number,
    start: number
  ) {
    this.ratio = clamp(start, min, max);
  }

  /** Feeds one call's frame. True when `ratio` changed. */
  update({ delta, dropped }: FrameState): boolean {
    this.time += delta;
    if (this.cooldown > 0) {
      this.cooldown -= delta;
      return false;
    }
    this.calls++;
    this.seconds += delta;
    if (dropped > 0) this.late++;
    if (this.calls < WINDOW) return false;

    const late = this.late;
    const seconds = this.seconds;
    this.restartWindow();
    if (late <= SLOW) {
      this.mode = { kind: "adapting" };
      this.settled = late <= ON_TIME ? this.settled + seconds : 0;
      const next = Math.min(this.max, this.ratio + STEP);
      const failedAt = this.failures.get(next);
      const retry = failedAt === undefined || this.time - failedAt > RETRY_S;
      return this.settled > SETTLE_S && next > this.ratio && retry && this.change(next);
    }
    this.settled = 0;
    switch (this.mode.kind) {
      case "holding":
        return false;
      case "adapting":
        if (this.ratio === this.min) return false;
        this.mode = { kind: "sliding", from: this.ratio, late };
        return this.stepDown();
      case "sliding": {
        if (this.ratio > this.min) return this.stepDown();
        // Resolution halved the drops, so `min` is the best this device does.
        if (late * 2 <= this.mode.late) return false;
        const { from } = this.mode;
        this.mode = { kind: "holding" };
        // The slide blamed resolution for drops it couldn't fix.
        this.failures.clear();
        return this.change(from);
      }
      default: {
        const _exhaustive: never = this.mode;
        throw new Error(`Unhandled pixel ratio mode: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  /** The loop stopped (or the tab hid): the frames around it say nothing about load. A hold carries over,
   * ending at the first window that doesn't drop. */
  pause() {
    this.restartWindow();
    this.cooldown = CHANGE_COOLDOWN_S;
    this.settled = 0;
  }

  private stepDown() {
    this.failures.set(this.ratio, this.time);
    return this.change(Math.max(this.min, this.ratio - STEP));
  }

  private change(ratio: number) {
    this.ratio = ratio;
    this.settled = 0;
    this.cooldown = CHANGE_COOLDOWN_S;
    return true;
  }

  private restartWindow() {
    this.calls = 0;
    this.late = 0;
    this.seconds = 0;
  }
}
