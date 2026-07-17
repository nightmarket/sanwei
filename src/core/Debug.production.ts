import type { Pane, PaneOptions } from "@nightmarket/tiao/core";
import type { DebugInitOptions, DebugSetup } from "./Debug";

/** Production replacement for the development Debug runtime. */
export class DebugClass {
  isSingleton = true;
  pane: Pane | null = null;
  inspectorPane: Pane | null = null;
  perf = null;

  get tunePane() {
    return null;
  }

  get renderer() {
    return null;
  }

  set renderer(_value: unknown) {}

  async init(_options: DebugInitOptions = {}) {
    return null;
  }

  setup(_callback: DebugSetup) {
    return () => {};
  }

  async run<T>(_callback: () => T | Promise<T>) {
    return undefined;
  }

  createPane(_options: PaneOptions = {}): never {
    throw new Error("[Debug] createPane() is unavailable in production");
  }

  register(_name: string, _folder: unknown) {}

  get(_name: string, _callback: (folder: unknown) => void) {}

  flushWarnings() {}

  addButton(
    _target: unknown,
    _options: { title?: string; label?: string; cb: () => void }
  ) {}

  async createOrbitControls(_camera: unknown, _domElement: HTMLElement) {
    return null;
  }

  dispose() {}

  update() {}
}

export const Debug = new DebugClass();
