import { Accelerometer } from "./Accelerometer";
import { AssetManager } from "./AssetManager";
import { CameraManager } from "./CameraManager";
import type { DebugContext } from "./debugHelpers";
import { Device } from "./Device";
import { type AppUniformsShape, createAppUniforms, GlobalUniforms } from "./globalUniformsAdapter";
import { Input } from "./Input";
import { Mouse } from "./Mouse";
import { RAF } from "./RAF";
import { RendererManager } from "./RendererManager";
import { SceneManager } from "./SceneManager";

const GLOBAL_TICK_ID = "sanwei:globals";

let globalsReady: Promise<void> | null = null;

/**
 * One-time process-wide setup shared by every app: the RAF loop, device/GPU
 * detection, window-level input, and the asset cache. Idempotent.
 */
function ensureGlobals() {
  if (!globalsReady) {
    globalsReady = (async () => {
      RAF.init();
      await Device.init();
      Accelerometer.init();
      Mouse.init();
      await AssetManager.init();
      Input.init();

      // Single global ticker: window-level input easing and the shared clock
      // advance once per frame regardless of how many apps are running.
      RAF.subscribe(GLOBAL_TICK_ID, () => {
        Mouse.update();
        GlobalUniforms.uTime.value += RAF.delta;
      });
    })();
  }
  return globalsReady;
}

export type SanweiAppOptions = {
  /** Unique per canvas — used as the RAF subscription id and debug folder prefix. */
  name: string;
  canvas: HTMLCanvasElement;
  /** A constructed (and, for WebGPU, initialized) renderer. */
  renderer: any;
  /** Optional frame-rate cap for this app's update loop. */
  fps?: number | null;
  /** Creates (or returns) the shared debug context. Only pass from one app unless you want per-app debug folders. */
  initDebug?: () => Promise<DebugContext | null>;
  /** Reuse an existing debug context (e.g. the one the main app created). */
  debugContext?: DebugContext | null;
};

/** Canvas-local pointer state derived from the window-level `Mouse` singleton. */
export type AppPointer = {
  /** NDC relative to this app's canvas rect. Unclamped — beyond ±1 when the cursor is outside. */
  ndc: { x: number; y: number };
  /** True when the cursor is inside the canvas rect. */
  isOver: boolean;
};

/**
 * A self-contained engine instance bound to one canvas: renderer, scenes,
 * cameras, per-canvas uniforms, sizing, and a canvas-local pointer.
 *
 * Create via {@link createSanweiApp}. Multiple apps share one RAF loop and the
 * global singletons (Device, Mouse, AssetManager, Input).
 */
export class SanweiApp {
  readonly name: string;
  readonly canvas: HTMLCanvasElement;
  readonly uniforms: AppUniformsShape;
  readonly rendererManager: RendererManager;
  readonly scenes: SceneManager;
  readonly cameras: CameraManager;
  readonly pointer: AppPointer = { ndc: { x: 0, y: 0 }, isOver: false };
  /** Resolves when the app is fully initialized (also returned by `createSanweiApp`). */
  ready: Promise<void>;

  debugContext: DebugContext | null = null;

  private fps: number | null;
  private initDebugFn?: () => Promise<DebugContext | null>;
  private sharedDebugContext: DebugContext | null = null;
  private ownsDebugContext = false;
  private running = false;
  private hasSize = false;
  private resizeObserver: ResizeObserver | null = null;
  private readyResolve!: () => void;

  constructor(options: SanweiAppOptions) {
    this.name = options.name;
    this.canvas = options.canvas;
    this.fps = options.fps ?? null;
    this.initDebugFn = options.initDebug;
    this.sharedDebugContext = options.debugContext ?? null;

    this.uniforms = createAppUniforms();
    this.rendererManager = new RendererManager(this.uniforms, this.name);
    this.rendererManager.renderer = options.renderer;
    this.scenes = new SceneManager(this);
    this.cameras = new CameraManager(this);

    this.ready = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /** The raw three.js renderer. */
  get renderer() {
    return this.rendererManager.renderer;
  }

  /** Render a scene with this app's renderer. */
  render(scene: any, camera: any) {
    this.rendererManager.render(scene, camera);
  }

  /** True between `start()` and `stop()`. */
  get isRunning() {
    return this.running;
  }

  async init() {
    await ensureGlobals();

    this.uniforms.uPixelRatio.value = Device.pixelRatio;
    this.rendererManager.init({ canvas: this.canvas, renderer: this.rendererManager.renderer });

    const debugContext = this.sharedDebugContext ?? ((await this.initDebugFn?.()) || null);
    if (debugContext) {
      this.debugContext = debugContext;
      this.ownsDebugContext = !this.sharedDebugContext;
      await this.rendererManager.initDebug(debugContext);
      await this.scenes.initDebug(debugContext);
      await this.cameras.initDebug(debugContext);
    }

    this.handleResize();
    if (this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.canvas.parentElement);
    }

    this.readyResolve();
  }

  /**
   * Generic helper for initializing app objects: awaits `init()` (static or
   * instance) and wires `initDebug` when a debug context exists.
   */
  initClass = async (Class: any, ...args: any[]) => {
    let ret: any;

    if (Class.isSingleton) {
      Class.init && (await Class.init(...args));
      ret = Class;
    } else {
      ret = new Class(...args);
      if (ret.init) {
        await ret.init(...args);
      }
    }

    if (this.debugContext && ret.initDebug) {
      await ret.initDebug(this.debugContext);
    }

    return ret;
  };

  /** Subscribe this app's update loop to the shared RAF. */
  start() {
    if (this.running) return;
    this.running = true;
    RAF.subscribe(this.name, this.update, this.fps);
  }

  /** Unsubscribe from the shared RAF. The last frame stays on the canvas. */
  stop() {
    if (!this.running) return;
    this.running = false;
    RAF.unsubscribe(this.name);
  }

  update = () => {
    if (!this.hasSize) return;
    this.updatePointer();
    this.scenes.render();
    this.cameras.update();
  };

  handleResize = () => {
    this.hasSize = this.rendererManager.resize();
    if (!this.hasSize) return;
    this.scenes.resize();
    this.cameras.resize();
  };

  /**
   * Map the window-level mouse NDC into this canvas's local NDC. Reads the
   * live rect so canvases inside animating layouts stay accurate.
   */
  private updatePointer() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.pointer.isOver = false;
      return;
    }

    // Mouse.position is window NDC — invert back to client px, then re-project.
    const clientX = ((Mouse.position.x + 1) / 2) * window.innerWidth;
    const clientY = ((1 - Mouse.position.y) / 2) * window.innerHeight;

    this.pointer.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.pointer.isOver =
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  destroy() {
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.scenes.destroy();
    this.cameras.destroy();
    this.rendererManager.destroy();
    if (this.ownsDebugContext) {
      this.debugContext?.debug.dispose();
    }
    this.debugContext = null;
  }
}

/** Create and fully initialize a {@link SanweiApp} for one canvas. */
export async function createSanweiApp(options: SanweiAppOptions): Promise<SanweiApp> {
  const app = new SanweiApp(options);
  await app.init();
  return app;
}
