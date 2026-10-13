import normalizeWheel from "normalize-wheel-es";
import { MathUtils, Vector2 } from "three";
import { events, getPos } from "../util/responsive";
import { NO_RAYCAST_CLASS } from "./constants";
import { type FrameState, TUNED_FPS } from "./RAF";

/** Cap per wheel event so one mouse-wheel tick (~100-120px) doesn't jump `scroll.target` much
 * farther than a trackpad swipe (~1-20px) would. The `scroll.target → scroll.current` lerp in
 * `update()` then spreads each clamped tick over several frames, giving wheel + trackpad the
 * same inertial feel. */
const MAX_WHEEL_STEP_PX = 40;
const COARSE_WHEEL_THRESHOLD_PX = 50;
// Click/tap classification follows common UI slop: short release plus little pointer travel.
const CLICK_MAX_DURATION_MS = 500;
const LONG_PRESS_DRAG_DELAY_MS = 500;
const MOUSE_CLICK_MOVE_THRESHOLD_PX = 5;
const TOUCH_CLICK_MOVE_THRESHOLD_PX = 12;
const MOUSE_DRAG_SCROLL_SCALE = 100;
const DRAG_MOMENTUM_FRAME_MS = 1000 / 60;
const DRAG_MOMENTUM_SCALE = 0.6;
const DRAG_MOMENTUM_FRICTION = 0.96;
/** A finger's fling slows the way UIScrollView's normal deceleration does: 0.2% of its speed lost each ms. */
const TOUCH_MOMENTUM_FRICTION = 0.998 ** (1000 / TUNED_FPS);
const DRAG_MOMENTUM_STOP_THRESHOLD_SQ = 0.000025;
/** Frames a native scroller sits still, with no finger on it, before it goes back to mid-range. */
const SCROLLER_SETTLE_FRAMES = 12;
/** A touch fling leaves at the finger's average speed over its last this-many ms, so a finger held still
 * before lifting lets go without one. */
const TOUCH_RELEASE_WINDOW_MS = 50;
/** Moves a touch drag keeps for reading back: over 100 ms of them at 240 Hz. */
const TOUCH_TRAIL_LENGTH = 32;
const WHEEL_MOMENTUM_SCALE = 0.08;
const WHEEL_MOMENTUM_FRICTION = 0.94;
const WHEEL_MOMENTUM_STOP_THRESHOLD_SQ = 0.000025;
const TRACKPAD_WHEEL_STEP_SCALE = 0.5;
const COARSE_WHEEL_STEP_SCALE = 0.8;
const MAX_COARSE_WHEEL_STEP_PX = 140;
const MAX_WHEEL_MOMENTUM = 24;

const NO_RAYCAST_SELECTOR = `.${NO_RAYCAST_CLASS}`;

export const SCROLL_DIRECTION = {
  DOWN: 1,
  UP: 2,
  LEFT: 3,
  RIGHT: 4,
  NONE: 5,
} as const;

export interface MouseDragState {
  start: Vector2;
  active: boolean;
  isDragging: boolean;
  startTime: number;
  lastMoveTime: number;
  momentumVelocity: Vector2;
  /** A finger, not a mouse: the scroll follows it 1:1 instead of easing after it. */
  touch: boolean;
}

export interface MouseScrollState {
  ease: number;
  current: Vector2;
  target: Vector2;
  last: Vector2;
  velocity: Vector2;
  dragStart: Vector2;
}

const isTouchEvent = (e: MouseEvent | TouchEvent) => "changedTouches" in e;

/** True when the event originated inside an element flagged with `NO_RAYCAST_CLASS` — UI panels
 * mark themselves with this class so input-driven scene behaviors (raycast, scroll, drag) don't
 * fire while interacting with overlay UI. */
const isOverUi = (e: Event) => e.target instanceof Element && !!e.target.closest(NO_RAYCAST_SELECTOR);

const clickMoveThreshold = (e: MouseEvent | TouchEvent) =>
  isTouchEvent(e) ? TOUCH_CLICK_MOVE_THRESHOLD_PX : MOUSE_CLICK_MOVE_THRESHOLD_PX;

type TouchSample = { time: number; x: number; y: number };

/** A touch drag's recent scroll targets at their moves' timestamps, oldest first. */
class TouchTrail {
  private samples: TouchSample[] = [];

  clear() {
    this.samples.length = 0;
  }

  push(time: number, { x, y }: Vector2) {
    const last = this.samples.at(-1);
    // WebKit stamps events in whole ms, so moves can share a stamp: the later one wins.
    if (last && time <= last.time) {
      last.x = x;
      last.y = y;
      return;
    }
    this.samples.push({ time, x, y });
    if (this.samples.length > TOUCH_TRAIL_LENGTH) this.samples.shift();
  }

  /** The target at `time`, between the moves around it; past the newest, carried on along the last move
   * for up to half its length, so a move that lands late doesn't stall the scroll for a frame. */
  read(time: number, out: Vector2) {
    let previous: TouchSample | undefined;
    let older: TouchSample | undefined;
    for (const sample of this.samples) {
      if (sample.time > time) {
        if (!older) return out.set(sample.x, sample.y);
        const t = (time - older.time) / (sample.time - older.time);
        return out.set(MathUtils.lerp(older.x, sample.x, t), MathUtils.lerp(older.y, sample.y, t));
      }
      previous = older;
      older = sample;
    }
    if (!older) return out;
    if (!previous) return out.set(older.x, older.y);
    const span = older.time - previous.time;
    const t = Math.min(time - older.time, span / 2) / span;
    return out.set(older.x + (older.x - previous.x) * t, older.y + (older.y - previous.y) * t);
  }
}

class MouseClass {
  isSingleton = true;
  blockedByUI = false;
  /** False until the first pointer event arrives. Until then `position` sits at NDC origin (0, 0)
   * so any consumer doing trig with it (e.g. spiral mouse-parallax tilt) reads neutral instead of
   * a stale "off-screen" sentinel. Per-frame raycast consumers gate on this so picking doesn't
   * fire from the origin before the user has actually pointed at anything. */
  hasMoved = false;

  /** Window-relative NDC (y up). */
  position = new Vector2();
  velocity = new Vector2();
  scroll: MouseScrollState = {
    ease: 0.15,
    current: new Vector2(),
    target: new Vector2(),
    last: new Vector2(),
    velocity: new Vector2(),
    dragStart: new Vector2(),
  };
  scrollDirection = new Vector2(SCROLL_DIRECTION.NONE, SCROLL_DIRECTION.NONE);
  drag: MouseDragState = {
    start: new Vector2(),
    active: false,
    isDragging: false,
    startTime: 0,
    lastMoveTime: 0,
    momentumVelocity: new Vector2(),
    touch: false,
  };
  lastUpWasClick = false;
  /** Refreshes a touch drag reads behind each frame. Its moves are timestamped, so reading a little behind
   * the newest steps the scroll evenly however the moves land between frames; 0 reads the newest. */
  touchReadDelay = 1;
  /** Scroll units per CSS px a finger travels, on each axis, for a touch drag and for an attached
   * scroller alike. Set it so whatever is under the finger stays under it. */
  touchScale = new Vector2(1, 1);

  private lastPosition = new Vector2();
  private lastTime: number | null = null;
  private dragStartPx = new Vector2();
  private wheelMomentumVelocity = new Vector2();
  private wheelMomentumScratch = new Vector2();
  private touchTrail = new TouchTrail();
  private touchReleaseScratch = new Vector2();
  /** The press landed on a fling and stopped it, so lifting it isn't a click. */
  private stoppedFling = false;
  private scroller: HTMLElement | null = null;
  private scrollerOffset = new Vector2();
  private scrollerLast = new Vector2();
  private scrollerStillFrames = 0;
  private isScrollLocked = false;
  private dragLongPressTimeout: number | null = null;
  private handledWheelEvents = new WeakSet<WheelEvent>();

  private clearLongPressTimeout = () => {
    if (this.dragLongPressTimeout === null) return;
    window.clearTimeout(this.dragLongPressTimeout);
    this.dragLongPressTimeout = null;
  };

  private startDrag = (now = performance.now()) => {
    if (!this.drag.active || this.drag.isDragging) return;
    this.clearLongPressTimeout();
    this.drag.isDragging = true;
    // A finger's scroll follows it 1:1 from here, so the travel that told the drag from a tap is slop, as
    // in native scrolling, rather than a jump.
    if (!this.drag.touch) return;
    this.drag.start.copy(this.position);
    this.scroll.dragStart.copy(this.scroll.target);
    this.touchTrail.clear();
    this.touchTrail.push(now, this.scroll.target);
  };

  private updatePosition = (e: MouseEvent | TouchEvent, now: number) => {
    this.blockedByUI = isOverUi(e);
    this.lastTime ??= now;

    const pointer = getPos(e);
    this.position.set((pointer.x / window.innerWidth) * 2 - 1, -(pointer.y / window.innerHeight) * 2 + 1);
    this.hasMoved = true;

    const delta = Math.max(now - this.lastTime, 1);
    this.velocity.set((this.position.x - this.lastPosition.x) / delta, (this.position.y - this.lastPosition.y) / delta);
    this.lastTime = now;
    this.lastPosition.copy(this.position);

    return pointer;
  };

  private updateDragTarget = (now: number) => {
    const deltaX = this.position.x - this.drag.start.x;
    const deltaY = this.position.y - this.drag.start.y;

    if (this.drag.touch) {
      // One NDC unit spans half the viewport on each axis.
      this.scroll.target.set(
        this.scroll.dragStart.x - deltaX * (window.innerWidth / 2) * this.touchScale.x,
        this.scroll.dragStart.y + deltaY * (window.innerHeight / 2) * this.touchScale.y
      );
      this.touchTrail.push(now, this.scroll.target);
      return;
    }

    const targetX = this.scroll.dragStart.x - deltaX * MOUSE_DRAG_SCROLL_SCALE;
    const targetY = this.scroll.dragStart.y + deltaY * MOUSE_DRAG_SCROLL_SCALE;
    if (targetX !== this.scroll.target.x || targetY !== this.scroll.target.y) {
      const elapsed = Math.max(now - this.drag.lastMoveTime, 1);
      const scale = (DRAG_MOMENTUM_FRAME_MS / elapsed) * DRAG_MOMENTUM_SCALE;
      this.drag.momentumVelocity.set(
        (targetX - this.scroll.target.x) * scale,
        (targetY - this.scroll.target.y) * scale
      );
      this.drag.lastMoveTime = now;
    }

    this.scroll.target.set(targetX, targetY);
  };

  /** The fling leaves from where the scroll shows, at the finger's recent speed, so it carries the drag on
   * instead of jumping to the finger and easing after it. */
  private releaseTouch = (now: number) => {
    const from = this.touchTrail.read(now - TOUCH_RELEASE_WINDOW_MS, this.touchReleaseScratch);
    this.drag.momentumVelocity
      .subVectors(this.scroll.target, from)
      .multiplyScalar(1000 / TUNED_FPS / TOUCH_RELEASE_WINDOW_MS);
    this.scroll.target.copy(this.scroll.current);
  };

  // Timed by the events' own timestamps rather than when their handlers ran, so a busy frame between two
  // moves doesn't skew the drag velocity.
  private handleMousemove = (e: MouseEvent | TouchEvent) => {
    const now = e.timeStamp;
    const { x, y } = this.updatePosition(e, now);

    if (!this.drag.active || this.isScrollLocked || this.scroller) return;

    const threshold = clickMoveThreshold(e);
    const clickDeltaX = x - this.dragStartPx.x;
    const clickDeltaY = y - this.dragStartPx.y;

    if (!this.drag.isDragging && clickDeltaX * clickDeltaX + clickDeltaY * clickDeltaY > threshold * threshold) {
      this.startDrag(now);
    }

    if (this.drag.isDragging) {
      this.updateDragTarget(now);
    }
  };

  private handleMousedown = (e: MouseEvent | TouchEvent) => {
    this.clearLongPressTimeout();
    if (isOverUi(e)) return;
    const now = e.timeStamp;
    const { x, y } = this.updatePosition(e, now);
    this.lastUpWasClick = false;
    if (this.isScrollLocked) return;
    this.stoppedFling = isTouchEvent(e) && this.drag.momentumVelocity.lengthSq() > 0;
    this.drag.active = true;
    this.drag.isDragging = false;
    this.drag.startTime = now;
    this.drag.lastMoveTime = now;
    this.drag.start.copy(this.position);
    this.drag.touch = isTouchEvent(e);
    this.dragStartPx.set(x, y);
    this.scroll.dragStart.copy(this.scroll.target);
    this.drag.momentumVelocity.set(0, 0);
    this.wheelMomentumVelocity.set(0, 0);
    this.scroll.velocity.set(0, 0);
    // With a scroller attached the browser decides what's a drag.
    if (!this.scroller) this.dragLongPressTimeout = window.setTimeout(this.startDrag, LONG_PRESS_DRAG_DELAY_MS);
  };

  private handleMouseup = (e: MouseEvent | TouchEvent) => {
    if (!this.drag.active) {
      this.lastUpWasClick = false;
      return;
    }

    const now = e.timeStamp;
    const { x, y } = this.updatePosition(e, now);
    this.clearLongPressTimeout();

    const threshold = clickMoveThreshold(e);
    const deltaX = x - this.dragStartPx.x;
    const deltaY = y - this.dragStartPx.y;
    const movedBeyondClick = deltaX * deltaX + deltaY * deltaY > threshold * threshold;
    const heldTooLong = now - this.drag.startTime > CLICK_MAX_DURATION_MS;
    this.lastUpWasClick = !this.drag.isDragging && !movedBeyondClick && !heldTooLong && !this.stoppedFling;

    if (this.drag.isDragging && !this.scroller) {
      this.updateDragTarget(now);
      if (this.drag.touch) this.releaseTouch(now);
    }

    this.drag.active = false;
    this.drag.isDragging = false;

    if (this.lastUpWasClick) {
      this.drag.momentumVelocity.set(0, 0);
    }
  };

  /** The system took the touch (a gesture of its own, an alert): it ends without a click or a fling. */
  private handleTouchcancel = () => {
    this.clearLongPressTimeout();
    this.lastUpWasClick = false;
    this.drag.active = false;
    this.drag.isDragging = false;
  };

  private applyWheelDelta = (pixelX: number, pixelY: number, isCoarseWheel: boolean) => {
    this.drag.momentumVelocity.set(0, 0);
    const stepScale = isCoarseWheel ? COARSE_WHEEL_STEP_SCALE : TRACKPAD_WHEEL_STEP_SCALE;
    const maxStep = isCoarseWheel ? MAX_COARSE_WHEEL_STEP_PX : MAX_WHEEL_STEP_PX;
    const stepX = MathUtils.clamp(pixelX, -maxStep, maxStep) * stepScale;
    const stepY = MathUtils.clamp(pixelY, -maxStep, maxStep) * stepScale;
    this.scroll.target.x += stepX;
    this.scroll.target.y += stepY;
    this.scroll.velocity.set(stepX / 10, stepY / 10);

    if (isCoarseWheel) {
      this.wheelMomentumVelocity
        .add(this.wheelMomentumScratch.set(stepX * WHEEL_MOMENTUM_SCALE, stepY * WHEEL_MOMENTUM_SCALE))
        .clampLength(0, MAX_WHEEL_MOMENTUM);
    } else {
      this.wheelMomentumVelocity.set(0, 0);
    }
  };

  handleWheelDelta = (pixelX: number, pixelY: number, event?: WheelEvent) => {
    if (event) this.handledWheelEvents.add(event);
    if (event && isOverUi(event)) return false;

    const isCoarseWheel =
      event?.deltaMode !== 0 || Math.max(Math.abs(pixelX), Math.abs(pixelY)) >= COARSE_WHEEL_THRESHOLD_PX;

    if (this.isScrollLocked) return true;

    this.applyWheelDelta(pixelX, pixelY, isCoarseWheel);

    return true;
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.handledWheelEvents.has(e)) return;
    const { pixelX, pixelY } = normalizeWheel(e);
    this.handleWheelDelta(pixelX, pixelY, e);
  };

  init = () => {
    // Nothing here calls `preventDefault`, so the browser never has to wait on these to scroll.
    window.addEventListener(events.move, this.handleMousemove as EventListener, { passive: true });
    window.addEventListener(events.down, this.handleMousedown as EventListener, { passive: true });
    window.addEventListener(events.up, this.handleMouseup as EventListener, { passive: true });
    if (events.cancel) window.addEventListener(events.cancel, this.handleTouchcancel, { passive: true });

    if (events.wheel) {
      window.addEventListener(events.wheel, this.handleWheel as EventListener, { passive: true });
    }
  };

  /**
   * Hand touch scrolling to a native scroller over the scene, or back to drags with `null`. A finger then
   * scrolls it as the platform scrolls any page, tracking, flinging, decelerating, and stopping on a tap, and
   * `scroll` follows its offset through `touchScale`. Give it a range many screens long; it goes back to the
   * middle once it settles, so it never runs out.
   */
  attachScroller = (element: HTMLElement | null) => {
    this.scroller?.removeEventListener("scroll", this.readScroller);
    this.scroller = element;
    if (!element) return;
    element.addEventListener("scroll", this.readScroller, { passive: true });
    this.centerScroller();
  };

  /** The attached scroller back to the middle of its range, without moving `scroll`. Call it after the
   * scroller's size or scrolling axes change. */
  centerScroller = () => {
    const scroller = this.scroller;
    if (!scroller) return;
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
    scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
    this.readScroller();
    this.scrollerLast.copy(this.scrollerOffset);
    this.scrollerStillFrames = 0;
  };

  // Scroll events land in the frame's rendering steps ahead of its animation callbacks, so `update` reads
  // this frame's offset without asking for layout itself.
  private readScroller = () => {
    if (this.scroller) this.scrollerOffset.set(this.scroller.scrollLeft, this.scroller.scrollTop);
  };

  /** The scroller's movement since the last frame, into `scroll`: under a finger it's a drag, after the
   * lift its fling, read back as `drag.momentumVelocity`. */
  private followScroller(frames: number) {
    // A finger moving left or up scrolls the scroller forward, as a drag moves `scroll` forward.
    const stepX = (this.scrollerOffset.x - this.scrollerLast.x) * this.touchScale.x;
    const stepY = (this.scrollerOffset.y - this.scrollerLast.y) * this.touchScale.y;
    this.scrollerLast.copy(this.scrollerOffset);
    const moving = stepX !== 0 || stepY !== 0;
    this.drag.isDragging = this.drag.active && (this.drag.isDragging || moving);
    this.drag.momentumVelocity.set(0, 0);
    if (moving && !this.isScrollLocked) {
      this.scroll.target.x += stepX;
      this.scroll.target.y += stepY;
      this.scroll.current.x += stepX;
      this.scroll.current.y += stepY;
      if (!this.drag.active) this.drag.momentumVelocity.set(stepX / frames, stepY / frames);
    }
    this.scrollerStillFrames = moving || this.drag.active ? 0 : this.scrollerStillFrames + 1;
    if (this.scrollerStillFrames === SCROLLER_SETTLE_FRAMES) this.centerScroller();
  }

  setScrollLocked = (isLocked: boolean) => {
    if (this.isScrollLocked === isLocked) return;
    this.isScrollLocked = isLocked;
    if (isLocked) this.reset();
  };

  reset = () => {
    this.lastUpWasClick = false;
    this.clearLongPressTimeout();
    this.drag.active = false;
    this.drag.isDragging = false;
    this.drag.momentumVelocity.set(0, 0);
    this.wheelMomentumVelocity.set(0, 0);
    this.scroll.velocity.set(0, 0);
    this.scroll.current.set(0, 0);
    this.scroll.target.set(0, 0);
    this.scroll.last.set(0, 0);
    this.scroll.dragStart.set(0, 0);
    this.scrollDirection.set(SCROLL_DIRECTION.NONE, SCROLL_DIRECTION.NONE);
    this.touchTrail.clear();
  };

  private applyMomentum(frames: number) {
    if (this.drag.momentumVelocity.lengthSq() > DRAG_MOMENTUM_STOP_THRESHOLD_SQ) {
      const friction = this.drag.touch ? TOUCH_MOMENTUM_FRICTION : DRAG_MOMENTUM_FRICTION;
      this.drag.momentumVelocity.multiplyScalar(friction ** frames);
      this.scroll.target.addScaledVector(this.drag.momentumVelocity, frames);
    } else {
      this.drag.momentumVelocity.set(0, 0);
    }

    if (this.wheelMomentumVelocity.lengthSq() > WHEEL_MOMENTUM_STOP_THRESHOLD_SQ) {
      this.wheelMomentumVelocity.multiplyScalar(WHEEL_MOMENTUM_FRICTION ** frames);
      this.scroll.target.addScaledVector(this.wheelMomentumVelocity, frames);
    } else {
      this.wheelMomentumVelocity.set(0, 0);
    }
  }

  /** Momentum, friction, and the scroll ease are per `TUNED_FPS` frame, scaled by `frame.frames`. */
  update = (frame: FrameState) => {
    const { frames } = frame;
    if (frames === 0) return;

    if (this.scroller) {
      this.followScroller(frames);
      this.scroll.current.lerp(this.scroll.target, frame.lerpFactor(this.scroll.ease));
    } else {
      if (!this.drag.active) this.applyMomentum(frames);
      if (this.drag.touch && this.drag.isDragging) {
        this.touchTrail.read(frame.timestamp - this.touchReadDelay * frame.interval, this.scroll.current);
      } else if (this.drag.touch && this.drag.momentumVelocity.lengthSq() > 0) {
        this.scroll.current.copy(this.scroll.target);
      } else {
        this.scroll.current.lerp(this.scroll.target, frame.lerpFactor(this.scroll.ease));
      }
    }

    // Per tuned frame, so direction thresholds and `scroll.velocity` read the same at any refresh rate.
    const scrollDeltaX = (this.scroll.current.x - this.scroll.last.x) / frames;
    const scrollDeltaY = (this.scroll.current.y - this.scroll.last.y) / frames;

    if (scrollDeltaX > 0.01) {
      this.scrollDirection.x = SCROLL_DIRECTION.RIGHT;
    } else if (scrollDeltaX < -0.01) {
      this.scrollDirection.x = SCROLL_DIRECTION.LEFT;
    } else {
      this.scrollDirection.x = SCROLL_DIRECTION.NONE;
    }

    if (scrollDeltaY > 0.01) {
      this.scrollDirection.y = SCROLL_DIRECTION.DOWN;
    } else if (scrollDeltaY < -0.01) {
      this.scrollDirection.y = SCROLL_DIRECTION.UP;
    } else {
      this.scrollDirection.y = SCROLL_DIRECTION.NONE;
    }

    this.scroll.velocity.set(scrollDeltaX / 10, scrollDeltaY / 10);

    this.scroll.last.copy(this.scroll.current);
  };

  destroy = () => {
    this.clearLongPressTimeout();
    window.removeEventListener(events.move, this.handleMousemove as EventListener);
    window.removeEventListener(events.down, this.handleMousedown as EventListener);
    window.removeEventListener(events.up, this.handleMouseup as EventListener);
    if (events.cancel) window.removeEventListener(events.cancel, this.handleTouchcancel);

    if (events.wheel) {
      window.removeEventListener(events.wheel, this.handleWheel as EventListener);
    }

    this.attachScroller(null);
    this.handledWheelEvents = new WeakSet<WheelEvent>();
  };
}

export const Mouse = new MouseClass();
