import type { Pane, PaneOptions } from "@nightmarket/tiao/core";
import type { PerfMonitor } from "@nightmarket/tiao/perf-pane";
import type { Camera } from "three";
import { isDebugEnabled, NO_RAYCAST_CLASS } from "./constants";
import { Device } from "./Device";
import { RAF } from "./RAF";

export type DebugInitOptions = {
  renderer?: any;
  setup?: DebugSetup;
  /** Overrides for the host pane `setup` callbacks draw into. */
  pane?: PaneOptions;
};

export type DebugSetupContext = {
  debug: DebugClass;
  pane: Pane | null;
  inspectorPane: Pane | null;
  createPane: (options?: PaneOptions) => Pane;
};

export type DebugSetup = (context: {
  debug: DebugClass;
  pane: Pane;
  inspectorPane: Pane;
  createPane: (options?: PaneOptions) => Pane;
  // biome-ignore lint/suspicious/noConfusingVoidType: like React's EffectCallback, setups may return nothing or a cleanup.
}) => void | (() => void);

type SetupEntry = {
  callback: DebugSetup;
  cleanup?: () => void;
  mounted: boolean;
};

const DEFAULT_PANE: Pick<PaneOptions, "anchor" | "toggleKey" | "maxHeight"> = {
  anchor: "top-left",
  toggleKey: "`",
  maxHeight: 500,
};

/** Development-only, app-agnostic debug host. */
export class DebugClass {
  isSingleton = true;
  pane: Pane | null = null;
  inspectorPane: Pane | null = null;
  perf: PerfMonitor | null = null;

  private _renderer: any = null;
  private folders = new Map<string, any>();
  private queue = new Map<string, Array<(folder: any) => void>>();
  private setups = new Set<SetupEntry>();
  private panes = new Set<Pane>();
  private initPromise: Promise<void> | null = null;
  private PaneClass: typeof import("@nightmarket/tiao/core").Pane | null = null;
  private perfApi: typeof import("@nightmarket/tiao/perf-pane") | null = null;

  get renderer() {
    return this._renderer;
  }

  set renderer(value: any) {
    if (!isDebugEnabled()) return;
    this._renderer = value;
    if (value && this.PaneClass && !this.perf) {
      void this.attachPerf(value);
    }
  }

  async init({ renderer, setup, pane }: DebugInitOptions = {}) {
    if (!isDebugEnabled()) return null;
    if (renderer) this.renderer = renderer;

    if (!this.PaneClass) {
      this.initPromise ??= this.doInit();
      try {
        await this.initPromise;
      } finally {
        this.initPromise = null;
      }
    }

    if (setup) {
      this.ensureInspectorPane(pane);
      this.setup(setup);
    }
    this.mountSetups();
    return this.createContext();
  }

  private async doInit() {
    const [{ Pane }, perfApi] = await Promise.all([
      import("@nightmarket/tiao/core"),
      import("@nightmarket/tiao/perf-pane"),
    ]);

    this.PaneClass = Pane;
    this.perfApi = perfApi;

    if (this._renderer) {
      await this.attachPerf(this._renderer);
    }
  }

  setup(callback: DebugSetup) {
    if (!isDebugEnabled()) return () => {};

    const entry: SetupEntry = { callback, mounted: false };
    this.setups.add(entry);
    if (this.pane) this.mountSetup(entry);

    return () => {
      entry.cleanup?.();
      this.setups.delete(entry);
    };
  }

  async run<T>(callback: () => T | Promise<T>) {
    if (!isDebugEnabled()) return undefined;
    return callback();
  }

  createPane(options: PaneOptions = {}) {
    if (!this.PaneClass) {
      throw new Error("[Debug] createPane() requires Debug.init() to resolve first");
    }

    const pane = new this.PaneClass({ ...DEFAULT_PANE, ...options });
    pane.element.classList.add(NO_RAYCAST_CLASS);
    this.panes.add(pane);
    return pane;
  }

  private ensureInspectorPane(options?: PaneOptions) {
    if (this.inspectorPane) return this.inspectorPane;

    const pane = this.createPane({
      id: "debugger-inspector",
      title: "Inspector",
      ...options,
    });
    this.inspectorPane = pane;
    this.pane = pane;
    return pane;
  }

  private createContext(): DebugSetupContext | null {
    if (!this.PaneClass) return null;
    return {
      debug: this,
      pane: this.pane,
      inspectorPane: this.inspectorPane,
      createPane: (options) => this.createPane(options),
    };
  }

  private mountSetups() {
    for (const entry of this.setups) this.mountSetup(entry);
  }

  private mountSetup(entry: SetupEntry) {
    if (entry.mounted) return;
    const context = this.createContext();
    if (!context?.pane || !context.inspectorPane) return;

    entry.mounted = true;
    entry.cleanup =
      entry.callback({
        ...context,
        pane: context.pane,
        inspectorPane: context.inspectorPane,
      }) ?? undefined;
  }

  private async attachPerf(renderer: any) {
    if (this.perf || !this.perfApi || !this.PaneClass) return;

    this.perf = this.perfApi.createPerfMonitor({ renderer });
    const pane = this.createPane({
      id: "debugger-perf",
      title: "Performance",
      anchor: "top-right",
      order: -1,
    });
    this.perfApi.addPerfMonitors(pane, this.perf, { maxFps: 144 });
    this.addFrameLoopMonitors(pane, this.perf.interval);
    this.addDeviceMonitors(pane, renderer);
  }

  /** What this device actually got: the backend and quality tier vary most on phones. */
  private addDeviceMonitors(pane: Pane, renderer: any) {
    const device = {
      backend: renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2",
      gpu: Device.gpuInfo?.gpu ?? "unknown",
      tier: Device.tier,
      pixelRatio: renderer.getPixelRatio(),
    };
    const folder = pane.addFolder({ title: "Device" });
    for (const key of Object.keys(device) as (keyof typeof device)[]) {
      folder.addBinding(device, key, { readonly: true });
    }
  }

  /** Shared-loop cost: the whole loop as a graph, and each callback's share, read at poll time. */
  private addFrameLoopMonitors(pane: Pane, interval: number) {
    RAF.profiling = true;
    const loop = {
      get total() {
        return RAF.inspect().reduce((sum, entry) => sum + entry.ms, 0);
      },
      get callbacks() {
        return RAF.inspect()
          .map((entry) => `${entry.label} ${entry.ms.toFixed(2)}`)
          .join(" · ");
      },
    };
    const folder = pane.addFolder({ title: "Frame Loop" });
    folder.addBinding(loop, "total", {
      label: "Loop",
      readonly: true,
      view: "graph",
      interval,
      min: 0,
      unit: "ms",
      format: (value: number) => value.toFixed(2),
    });
    folder.addBinding(loop, "callbacks", { label: "Callbacks", readonly: true, interval });
  }

  register(name: string, folder: any) {
    this.folders.set(name, folder);

    const pending = this.queue.get(name);
    if (pending) {
      for (const fn of pending) fn(folder);
      this.queue.delete(name);
    }
  }

  get(name: string, fn: (folder: any) => void) {
    const folder = this.folders.get(name);
    if (folder) {
      fn(folder);
      return;
    }
    const pending = this.queue.get(name);
    if (pending) pending.push(fn);
    else this.queue.set(name, [fn]);
  }

  flushWarnings() {
    for (const [name, callbacks] of this.queue) {
      console.warn(`[Debug] ${callbacks.length} callback(s) queued for "${name}" were never resolved`);
    }
    this.queue.clear();
  }

  async createOrbitControls(camera: Camera, domElement: HTMLElement) {
    const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
    return new OrbitControls(camera, domElement);
  }

  dispose() {
    for (const entry of this.setups) entry.cleanup?.();
    this.setups.clear();
    this.perf?.dispose();
    RAF.profiling = false;

    for (const pane of this.panes) pane.dispose();
    this.panes.clear();

    this.pane = null;
    this.inspectorPane = null;
    this.perf = null;
    this._renderer = null;
    this.PaneClass = null;
    this.perfApi = null;
    this.folders.clear();
    this.queue.clear();
  }
}

export const Debug = new DebugClass();
