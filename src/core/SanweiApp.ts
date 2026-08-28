import { Accelerometer } from "./Accelerometer";
import { AssetManager } from "./AssetManager";
import { CameraManager } from "./CameraManager";
import type { DebugContext, DebugInitResult } from "./debugHelpers";
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

      RAF.subscribe(GLOBAL_TICK_ID, () => {
        Mouse.update();
        GlobalUniforms.uTime.value += RAF.delta;
      });
    })();
  }
  return globalsReady;
}

export type TickDesire = "stopped" | "running";
export type RectMode = "static" | "live";

export type SanweiAppOptions = {
  /** Unique per canvas — used as the RAF subscription id and debug pane title. */
  name: string;
  canvas: HTMLCanvasElement;
  /** A constructed (and, for WebGPU, initialized) renderer. */
  renderer: any;
  /** Optional frame-rate cap for this app's update loop. */
  fps?: number | null;
  /** Creates (or returns) the shared debug host. Scene panes are created per app. */
  initDebug?: () => Promise<DebugInitResult | null>;
  /** Reuse an existing debug host (e.g. the one the main app created). */
  debugContext?: DebugInitResult | null;
  /**
   * When true, unsubscribe from RAF while the canvas is offscreen or the tab is hidden.
   * Explicit `stop()` still wins. Default false.
   */
  pauseWhenHidden?: boolean;
  /**
   * `live` reads the canvas rect every frame. `static` caches it and refreshes on
   * resize/scroll. Default `live`.
   */
  rectMode?: RectMode;
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
 * global singletons (Device, Mouse, AssetManager, Input). Optional
 * `pauseWhenHidden` gates the RAF subscription; `rectMode: "static"` caches the
 * pointer rect instead of reading it every frame.
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
  private initDebugFn?: () => Promise<DebugInitResult | null>;
  private sharedDebugContext: DebugInitResult | null = null;
  private ownsDebugContext = false;
  private appPane: DebugContext["pane"] | null = null;
  private desire: TickDesire = "stopped";
  private ticking = false;
  private pauseWhenHidden: boolean;
  private rectMode: RectMode;
  private isIntersecting = true;
  private hasSize = false;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private cachedRect: DOMRect | null = null;
  private readyResolve!: () => void;

  constructor(options: SanweiAppOptions) {
    this.name = options.name;
    this.canvas = options.canvas;
    this.fps = options.fps ?? null;
    this.initDebugFn = options.initDebug;
    this.sharedDebugContext = options.debugContext ?? null;
    this.pauseWhenHidden = options.pauseWhenHidden ?? false;
    this.rectMode = options.rectMode ?? "live";

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

  /** True between `start()` and `stop()`. Independent of visibility gating. */
  get isRunning() {
    return this.desire === "running";
  }

  async init() {
    await ensureGlobals();

    this.uniforms.uPixelRatio.value = Device.pixelRatio;
    this.rendererManager.init({ canvas: this.canvas, renderer: this.rendererManager.renderer });

    const shared = this.sharedDebugContext ?? ((await this.initDebugFn?.()) || null);
    if (shared) {
      this.debugContext = this.bindDebugPane(shared);
      await this.rendererManager.initDebug(this.debugContext);
      await this.scenes.initDebug(this.debugContext);
      await this.cameras.initDebug(this.debugContext);
    }

    this.handleResize();
    if (this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.canvas.parentElement);
    }
    this.attachVisibility();
    this.attachRectListeners();
    this.refreshRect();

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
    this.desire = "running";
    this.syncTick();
  }

  /** Unsubscribe from the shared RAF. The last frame stays on the canvas. */
  stop() {
    this.desire = "stopped";
    this.syncTick();
  }

  update = () => {
    if (!this.hasSize) return;
    this.updatePointer();
    this.scenes.render();
    this.cameras.update();
  };

  handleResize = () => {
    this.hasSize = this.rendererManager.resize();
    this.refreshRect();
    if (!this.hasSize) return;
    this.scenes.resize();
    this.cameras.resize();
  };

  private syncTick() {
    const shouldTick = this.desire === "running" && this.isVisible();
    if (shouldTick === this.ticking) return;
    if (shouldTick) {
      RAF.subscribe(this.name, this.update, this.fps);
    } else {
      RAF.unsubscribe(this.name);
    }
    this.ticking = shouldTick;
  }

  private isVisible() {
    if (!this.pauseWhenHidden) return true;
    return this.isIntersecting && !document.hidden;
  }

  private attachVisibility() {
    if (!this.pauseWhenHidden) return;
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        this.isIntersecting = entries.some((entry) => entry.isIntersecting);
        this.syncTick();
      },
      { threshold: 0 }
    );
    this.intersectionObserver.observe(this.canvas);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private onVisibilityChange = () => {
    this.syncTick();
  };

  private attachRectListeners() {
    if (this.rectMode !== "static") return;
    window.addEventListener("scroll", this.refreshRect, { capture: true, passive: true });
    window.visualViewport?.addEventListener("resize", this.refreshRect);
    window.visualViewport?.addEventListener("scroll", this.refreshRect);
  }

  private refreshRect = () => {
    this.cachedRect = this.canvas.getBoundingClientRect();
  };

  /**
   * Map the window-level mouse NDC into this canvas's local NDC. Reads the
   * live rect so canvases inside animating layouts stay accurate.
   */
  private updatePointer() {
    const rect = this.rectMode === "static" ? this.cachedRect : this.canvas.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      this.pointer.isOver = false;
      return;
    }

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
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    if (this.rectMode === "static") {
      window.removeEventListener("scroll", this.refreshRect, { capture: true });
      window.visualViewport?.removeEventListener("resize", this.refreshRect);
      window.visualViewport?.removeEventListener("scroll", this.refreshRect);
    }
    this.scenes.destroy();
    this.cameras.destroy();
    this.rendererManager.destroy();
    if (this.ownsDebugContext) {
      this.debugContext?.debug.dispose();
    } else {
      this.appPane?.dispose();
    }
    this.appPane = null;
    this.debugContext = null;
  }

  private bindDebugPane(shared: DebugInitResult): DebugContext {
    this.ownsDebugContext = !this.sharedDebugContext;
    const title = paneTitle(this.name);
    const pane =
      this.ownsDebugContext && shared.pane
        ? shared.pane
        : shared.debug.createPane({
            id: `debugger-${this.name}`,
            title,
          });
    pane.title = title;
    this.appPane = pane;
    return {
      debug: shared.debug,
      pane,
      inspectorPane: pane,
      tunePane: pane,
    };
  }
}

function paneTitle(name: string) {
  return name ? name[0]!.toUpperCase() + name.slice(1) : name;
}

/** Create and fully initialize a {@link SanweiApp} for one canvas. */
export async function createSanweiApp(options: SanweiAppOptions): Promise<SanweiApp> {
  const app = new SanweiApp(options);
  await app.init();
  return app;
}
