import normalizeWheel from "normalize-wheel-es";
import type { Vector2 } from "three";
import { THREE } from "../three-adapter";
import { events, getPos } from "../util/responsive";
import { NO_RAYCAST_CLASS } from "./constants";

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
const TOUCH_DRAG_SCROLL_SCALE = 180;
const DRAG_MOMENTUM_FRAME_MS = 1000 / 60;
const DRAG_MOMENTUM_SCALE = 0.6;
const DRAG_MOMENTUM_FRICTION = 0.96;
const DRAG_MOMENTUM_STOP_THRESHOLD_SQ = 0.000025;
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
  scrollScale: number;
}

export interface MouseScrollState {
  ease: number;
  current: Vector2;
  target: Vector2;
  last: Vector2;
  velocity: Vector2;
  dragStart: Vector2;
}

class MouseClass {
  isSingleton = true;
  subscribers: Record<string, string[]> = {};
  callbacks: Record<string, () => void> = {};
  shouldUpdate = true;
  blockedByUI = false;
  /** False until the first pointer event arrives. Until then `position` sits at NDC origin (0, 0)
   * so any consumer doing trig with it (e.g. spiral mouse-parallax tilt) reads neutral instead of
   * a stale "off-screen" sentinel. Per-frame raycast consumers gate on this so picking doesn't
   * fire from the origin before the user has actually pointed at anything. */
  hasMoved = false;

  position!: Vector2;
  lastPosition!: Vector2;
  lastTime: number | null = null;
  velocity!: Vector2;
  scroll!: MouseScrollState;
  scrollDirection!: Vector2;
  drag!: MouseDragState;
  lastUpWasClick = false;
  private dragStartPx!: Vector2;
  private wheelMomentumVelocity!: Vector2;
  private wheelMomentumScratch!: Vector2;
  private isScrollLocked = false;
  private dragLongPressTimeout: number | null = null;
  private handledWheelEvents = new WeakSet<WheelEvent>();

  /** True when the event originated inside an element flagged with `NO_RAYCAST_CLASS` — UI panels
   * mark themselves with this class so input-driven scene behaviors (raycast, scroll, drag) don't
   * fire while interacting with overlay UI. */
  private isOverUi = (e: Event) => e.target instanceof Element && !!e.target.closest(NO_RAYCAST_SELECTOR);

  private getClickMoveThreshold = (e: MouseEvent | TouchEvent) =>
    "changedTouches" in e ? TOUCH_CLICK_MOVE_THRESHOLD_PX : MOUSE_CLICK_MOVE_THRESHOLD_PX;

  private isTouchEvent = (e: MouseEvent | TouchEvent) => "changedTouches" in e;

  private clearLongPressTimeout = () => {
    if (this.dragLongPressTimeout === null) return;
    window.clearTimeout(this.dragLongPressTimeout);
    this.dragLongPressTimeout = null;
  };

  private startDrag = () => {
    if (!this.drag.active || this.drag.isDragging) return;
    this.clearLongPressTimeout();
    this.drag.isDragging = true;
  };

  private updatePosition = (e: MouseEvent | TouchEvent, now = performance.now()) => {
    this.blockedByUI = this.isOverUi(e);

    if (!this.lastTime) {
      this.lastTime = now;
    }

    const pointer = getPos(e);
    const { x, y } = pointer;
    this.position.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.hasMoved = true;

    const delta = Math.max(now - this.lastTime, 1);
    const vX = (this.position.x - this.lastPosition.x) / delta;
    const vY = (this.position.y - this.lastPosition.y) / delta;

    this.lastTime = now;
    this.lastPosition.copy(this.position);
    this.velocity.set(vX, vY);

    return pointer;
  };

  private updateDragTarget = (now: number) => {
    const deltaX = this.position.x - this.drag.start.x;
    const deltaY = this.position.y - this.drag.start.y;
    const targetX = this.scroll.dragStart.x - deltaX * this.drag.scrollScale;
    const targetY = this.scroll.dragStart.y + deltaY * this.drag.scrollScale;

    if (targetX !== this.scroll.target.x || targetY !== this.scroll.target.y) {
      const elapsed = Math.max(now - this.drag.lastMoveTime, 1);

      this.drag.momentumVelocity.set(
        (targetX - this.scroll.target.x) * (DRAG_MOMENTUM_FRAME_MS / elapsed) * DRAG_MOMENTUM_SCALE,
        (targetY - this.scroll.target.y) * (DRAG_MOMENTUM_FRAME_MS / elapsed) * DRAG_MOMENTUM_SCALE
      );
      this.drag.lastMoveTime = now;
    }

    this.scroll.target.set(targetX, targetY);
  };

  private handleMousemove = (e: MouseEvent | TouchEvent) => {
    const now = performance.now();
    const { x, y } = this.updatePosition(e, now);

    if (this.drag.active && !this.isScrollLocked) {
      const threshold = this.getClickMoveThreshold(e);
      const clickDeltaX = x - this.dragStartPx.x;
      const clickDeltaY = y - this.dragStartPx.y;

      if (!this.drag.isDragging && clickDeltaX * clickDeltaX + clickDeltaY * clickDeltaY > threshold * threshold) {
        this.startDrag();
      }

      if (this.drag.isDragging) {
        this.updateDragTarget(now);
      }
    }

    this.subscribers[events.move]?.forEach((id) => {
      this.callbacks[id]?.();
    });
  };

  private handleMousedown = (e: MouseEvent | TouchEvent) => {
    this.clearLongPressTimeout();
    if (this.isOverUi(e)) return;
    const now = performance.now();
    const { x, y } = this.updatePosition(e, now);
    this.lastUpWasClick = false;
    if (this.isScrollLocked) return;
    this.drag.active = true;
    this.drag.isDragging = false;
    this.drag.startTime = now;
    this.drag.lastMoveTime = now;
    this.drag.start.copy(this.position);
    this.drag.scrollScale = this.isTouchEvent(e) ? TOUCH_DRAG_SCROLL_SCALE : MOUSE_DRAG_SCROLL_SCALE;
    this.dragStartPx.set(x, y);
    this.scroll.dragStart.copy(this.scroll.target);
    this.drag.momentumVelocity.set(0, 0);
    this.wheelMomentumVelocity.set(0, 0);
    this.scroll.velocity.set(0, 0);
    this.dragLongPressTimeout = window.setTimeout(this.startDrag, LONG_PRESS_DRAG_DELAY_MS);
  };

  private handleMouseup = (e: MouseEvent | TouchEvent) => {
    if (!this.drag.active) {
      this.lastUpWasClick = false;
      return;
    }

    const now = performance.now();
    const { x, y } = this.updatePosition(e, now);
    this.clearLongPressTimeout();

    const threshold = this.getClickMoveThreshold(e);
    const deltaX = x - this.dragStartPx.x;
    const deltaY = y - this.dragStartPx.y;
    const movedBeyondClick = deltaX * deltaX + deltaY * deltaY > threshold * threshold;
    const heldTooLong = now - this.drag.startTime > CLICK_MAX_DURATION_MS;
    this.lastUpWasClick = !this.drag.isDragging && !movedBeyondClick && !heldTooLong;

    if (this.drag.isDragging) {
      this.updateDragTarget(now);
    }

    this.drag.active = false;
    this.drag.isDragging = false;

    if (this.lastUpWasClick) {
      this.drag.momentumVelocity.set(0, 0);
    }
  };

  private applyWheelDelta = (pixelX: number, pixelY: number, isCoarseWheel: boolean) => {
    this.drag.momentumVelocity.set(0, 0);
    const stepScale = isCoarseWheel ? COARSE_WHEEL_STEP_SCALE : TRACKPAD_WHEEL_STEP_SCALE;
    const maxStep = isCoarseWheel ? MAX_COARSE_WHEEL_STEP_PX : MAX_WHEEL_STEP_PX;
    const stepX = THREE.MathUtils.clamp(pixelX, -maxStep, maxStep) * stepScale;
    const stepY = THREE.MathUtils.clamp(pixelY, -maxStep, maxStep) * stepScale;
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
    if (event && this.isOverUi(event)) return false;

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
    this.position = new THREE.Vector2(0, 0);
    this.lastPosition = new THREE.Vector2(0, 0);
    this.lastTime = null;
    this.hasMoved = false;
    this.velocity = new THREE.Vector2(0, 0);
    this.lastUpWasClick = false;
    this.dragStartPx = new THREE.Vector2(0, 0);
    this.wheelMomentumVelocity = new THREE.Vector2(0, 0);
    this.wheelMomentumScratch = new THREE.Vector2(0, 0);

    this.scroll = {
      ease: 0.15,
      current: new THREE.Vector2(0, 0),
      target: new THREE.Vector2(0, 0),
      last: new THREE.Vector2(0, 0),
      velocity: new THREE.Vector2(0, 0),
      dragStart: new THREE.Vector2(0, 0),
    };

    this.scrollDirection = new THREE.Vector2(SCROLL_DIRECTION.NONE, SCROLL_DIRECTION.NONE);

    this.drag = {
      start: new THREE.Vector2(0, 0),
      active: false,
      isDragging: false,
      startTime: 0,
      lastMoveTime: 0,
      momentumVelocity: new THREE.Vector2(0, 0),
      scrollScale: MOUSE_DRAG_SCROLL_SCALE,
    };

    this.subscribers[events.move] = [];
    if (events.wheel) this.subscribers[events.wheel] = [];

    window.addEventListener(events.move, this.handleMousemove as EventListener);
    window.addEventListener(events.down, this.handleMousedown as EventListener);
    window.addEventListener(events.up, this.handleMouseup as EventListener);

    if (events.wheel) {
      window.addEventListener(events.wheel, this.handleWheel as EventListener, { passive: true });
    }
  };

  subscribe = (event: string, id: string, cb: () => void) => {
    if (!this.subscribers[event]) this.subscribers[event] = [];
    this.subscribers[event].push(id);
    this.callbacks[id] = cb;
  };

  unsubscribe = (event: string, id: string) => {
    this.subscribers[event] = this.subscribers[event]?.filter((i) => i !== id) ?? [];
    delete this.callbacks[id];
  };

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
  };

  update = () => {
    if (!this.shouldUpdate) return;

    if (!this.drag.active) {
      if (this.drag.momentumVelocity.lengthSq() > DRAG_MOMENTUM_STOP_THRESHOLD_SQ) {
        this.drag.momentumVelocity.multiplyScalar(DRAG_MOMENTUM_FRICTION);
        this.scroll.target.add(this.drag.momentumVelocity);
      } else {
        this.drag.momentumVelocity.set(0, 0);
      }

      if (this.wheelMomentumVelocity.lengthSq() > WHEEL_MOMENTUM_STOP_THRESHOLD_SQ) {
        this.wheelMomentumVelocity.multiplyScalar(WHEEL_MOMENTUM_FRICTION);
        this.scroll.target.add(this.wheelMomentumVelocity);
      } else {
        this.wheelMomentumVelocity.set(0, 0);
      }
    }

    this.scroll.current.lerp(this.scroll.target, this.scroll.ease);

    const scrollDeltaX = this.scroll.current.x - this.scroll.last.x;
    const scrollDeltaY = this.scroll.current.y - this.scroll.last.y;

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

    if (events.wheel) {
      window.removeEventListener(events.wheel, this.handleWheel as EventListener);
    }

    this.subscribers = {};
    this.callbacks = {};
    this.handledWheelEvents = new WeakSet<WheelEvent>();
  };
}

export const Mouse = new MouseClass();
