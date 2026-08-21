import type { Pane, PaneOptions } from "@nightmarket/tiao/core";
import type { PerfMonitor } from "@nightmarket/tiao/perf-pane";
import type { Camera } from "three";
import { isDebugEnabled, NO_RAYCAST_CLASS } from "./constants";

export type DebugInitOptions = {
  renderer?: any;
  setup?: DebugSetup;
};

export type DebugSetupContext = {
  debug: DebugClass;
  pane: Pane;
  inspectorPane: Pane;
  /** @deprecated use inspectorPane */
  tunePane: Pane;
  createPane: (options?: PaneOptions) => Pane;
};

export type DebugSetup = (context: DebugSetupContext) => void | (() => void);

type SetupEntry = {
  callback: DebugSetup;
  cleanup?: () => void;
  mounted: boolean;
};

/** Development-only, app-agnostic debug host. */
export class DebugClass {
  isSingleton = true;
  pane: Pane | null = null;
  inspectorPane: Pane | null = null;
  /** @deprecated use inspectorPane */
  get tunePane() {
    return this.inspectorPane;
  }
  perf: PerfMonitor | null = null;

  private _renderer: any = null;
  private folders = new Map<string, any>();
  private queue = new Map<string, Array<(folder: any) => void>>();
  private setups = new Set<SetupEntry>();
  private initPromise: Promise<void> | null = null;
  private PaneClass: typeof import("@nightmarket/tiao/core").Pane | null = null;
  private perfApi: typeof import("@nightmarket/tiao/perf-pane") | null = null;

  get renderer() {
    return this._renderer;
  }

  set renderer(value: any) {
    if (!isDebugEnabled()) return;
    this._renderer = value;
    if (value && this.inspectorPane && !this.perf) {
      void this.attachPerf(value);
    }
  }

  async init({ renderer, setup }: DebugInitOptions = {}) {
    if (!isDebugEnabled()) return null;
    if (renderer) this.renderer = renderer;

    if (!this.inspectorPane) {
      if (!this.initPromise) {
        this.initPromise = this.doInit();
      }
      try {
        await this.initPromise;
      } finally {
        this.initPromise = null;
      }
    }

    if (setup) this.setup(setup);
    this.mountSetups();
    return this.createContext();
  }

  private async doInit() {
    const [{ Pane }, perfApi] = await Promise.all([
      import("@nightmarket/tiao/core"),
      import("@nightmarket/tiao/perf-pane"),
    ]);

    const pane = new Pane({
      id: "debugger-inspector",
      title: "Inspector",
      anchor: "top-left",
      toggleKey: "`",
      maxHeight: 500,
    });
    pane.element.classList.add(NO_RAYCAST_CLASS);

    this.PaneClass = Pane;
    this.inspectorPane = pane;
    this.pane = pane;
    this.perfApi = perfApi;

    if (this._renderer) {
      await this.attachPerf(this._renderer);
    }
  }

  setup(callback: DebugSetup) {
    if (!isDebugEnabled()) return () => {};

    const entry: SetupEntry = { callback, mounted: false };
    this.setups.add(entry);
    if (this.inspectorPane) this.mountSetup(entry);

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

    const pane = new this.PaneClass(options);
    pane.element.classList.add(NO_RAYCAST_CLASS);
    return pane;
  }

  private createContext(): DebugSetupContext | null {
    if (!this.pane || !this.inspectorPane) return null;
    return {
      debug: this,
      pane: this.pane,
      inspectorPane: this.inspectorPane,
      tunePane: this.inspectorPane,
      createPane: (options) => this.createPane(options),
    };
  }

  private mountSetups() {
    for (const entry of this.setups) this.mountSetup(entry);
  }

  private mountSetup(entry: SetupEntry) {
    if (entry.mounted) return;
    const context = this.createContext();
    if (!context) return;

    entry.mounted = true;
    entry.cleanup = entry.callback(context) ?? undefined;
  }

  private async attachPerf(renderer: any) {
    if (this.perf || !this.inspectorPane || !this.perfApi) return;

    this.perf = this.perfApi.createPerfMonitor({ renderer });
    const performanceFolder = this.inspectorPane.addFolder({
      title: "Performance",
      expanded: true,
    });
    this.perfApi.addPerfMonitors(performanceFolder, this.perf, { maxFps: 144 });
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
    } else {
      let pending = this.queue.get(name);
      if (!pending) {
        pending = [];
        this.queue.set(name, pending);
      }
      pending.push(fn);
    }
  }

  flushWarnings() {
    for (const [name, callbacks] of this.queue) {
      console.warn(`[Debug] ${callbacks.length} callback(s) queued for "${name}" were never resolved`);
    }
    this.queue.clear();
  }

  addButton(
    target: {
      addButton: (opts: { title: string; label?: string }) => {
        on: (ev: string, cb: () => void) => void;
      };
    },
    { title = "Click", label = "", cb }: { title?: string; label?: string; cb: () => void }
  ) {
    const btn = target.addButton({ title, label });
    btn.on("click", cb);
  }

  async createOrbitControls(camera: Camera, domElement: HTMLElement) {
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
    return new OrbitControls(camera, domElement);
  }

  dispose() {
    for (const entry of this.setups) entry.cleanup?.();
    this.setups.clear();
    this.perf?.dispose();

    if (this.pane && this.pane !== this.inspectorPane) {
      this.pane.dispose();
    }
    this.inspectorPane?.dispose();

    this.pane = null;
    this.inspectorPane = null;
    this.perf = null;
    this._renderer = null;
    this.PaneClass = null;
    this.perfApi = null;
    this.folders.clear();
    this.queue.clear();
  }

  update() {
    // Perf sampling is owned by @nightmarket/tiao/perf-pane (ticker + render instrumentation).
  }
}

export const Debug = new DebugClass();
