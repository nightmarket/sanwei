import type { Pane } from "@tiao/core";
import type { PerfMonitor } from "@tiao/perf-pane";
import { THREE } from "../three-adapter";
import { NO_RAYCAST_CLASS } from "./constants";
import { RendererManager } from "./RendererManager";

export type DebugInitOptions = {
  /** @deprecated tiao panes float by default; kept for call-site compat */
  containerId?: string;
  /** @deprecated perf monitors live in the pane; kept for call-site compat */
  statsContainerId?: string;
  title?: string;
  anchor?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

export class DebugClass {
  isSingleton = true;
  pane: Pane | null = null;
  /** Second pane: Performance folder + scene inspect controls. */
  inspectorPane: Pane | null = null;
  /** @deprecated use inspectorPane */
  get tunePane() {
    return this.inspectorPane;
  }
  perf: PerfMonitor | null = null;

  private _renderer: any = null;
  private folders = new Map<string, any>();
  private queue = new Map<string, Array<(folder: any) => void>>();
  private initPromise: Promise<void> | null = null;
  private perfApi: typeof import("@tiao/perf-pane") | null = null;

  get renderer() {
    return this._renderer;
  }

  set renderer(value: any) {
    this._renderer = value;
    if (value && this.inspectorPane && !this.perf) {
      void this.attachPerf(value);
    }
  }

  async init(options: DebugInitOptions = {}) {
    if (this.pane) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit(options);
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInit(options: DebugInitOptions) {
    const [{ Pane }, perfApi] = await Promise.all([
      import("@tiao/core"),
      import("@tiao/perf-pane"),
    ]);

    const pane = new Pane({
      id: "debugger",
      title: options.title ?? "Debug",
      anchor: options.anchor ?? "top-right",
      toggleKey: "`",
      maxHeight: 500,
    });
    pane.element.classList.add(NO_RAYCAST_CLASS);
    this.pane = pane;

    const hideUi = { value: false };
    pane
      .addBinding(hideUi, "value", { label: "Hide UI" })
      .on("change", (ev: { value: boolean }) => {
        document.documentElement.classList.toggle("hide-app-ui", ev.value);
      });

    const inspectorPane = new Pane({
      id: "debugger-inspector",
      title: "Inspector",
      anchor: "top-left",
      toggleKey: "`",
      maxHeight: 500,
    });
    inspectorPane.element.classList.add(NO_RAYCAST_CLASS);
    this.inspectorPane = inspectorPane;

    this.perfApi = perfApi;

    const renderer = this._renderer ?? RendererManager.renderer;
    if (renderer) {
      await this.attachPerf(renderer);
    }
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

  async createOrbitControls(camera: THREE.Camera, domElement: HTMLElement) {
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
    return new OrbitControls(camera, domElement);
  }

  update() {
    // Perf sampling is owned by @tiao/perf-pane (ticker + render instrumentation).
  }
}

export const Debug = new DebugClass();
