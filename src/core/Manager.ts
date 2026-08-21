import { Accelerometer } from "./Accelerometer";
import { AssetManager } from "./AssetManager";
import { CameraManager } from "./CameraManager";
import { Device } from "./Device";
import type { DebugContext } from "./debugHelpers";
import { GlobalUniforms } from "./globalUniformsAdapter";
import { Input } from "./Input";
import { Mouse } from "./Mouse";
import { RAF } from "./RAF";
import { RendererManager } from "./RendererManager";
import { SceneManager } from "./SceneManager";
import { Sound } from "./Sound";

// Re-export for backward compat (canonical source is constants.ts)
export { isDebugEnabled } from "./constants";

type ManagerInitOptions = {
  canvas: HTMLCanvasElement;
  renderer: any;
  initDebug?: () => Promise<DebugContext | null>;
};

class ManagerClass {
  isSingleton = true;
  shouldUpdate = true;
  private debugContext: DebugContext | null = null;

  init = async ({ canvas, renderer, initDebug }: ManagerInitOptions) => {
    RAF.init();

    await this.initClass(Device);
    await this.initClass(Accelerometer);
    await this.initClass(RendererManager, { canvas, renderer });

    const debugContext = await initDebug?.();
    if (debugContext) {
      this.debugContext = debugContext;
      await RendererManager.initDebug(debugContext);
      await this.initDebug(debugContext);
    }

    await this.initClass(Mouse);
    await this.initClass(AssetManager);
    await this.initClass(Input);
    await this.initClass(SceneManager);
    await this.initClass(CameraManager);

    this.handleResize();
    window.addEventListener("resize", this.handleResize);
  };

  async initDebug(_context: DebugContext) {}

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

  update = () => {
    if (!this.shouldUpdate) return;

    SceneManager.render();
    CameraManager.update();
    Mouse.update();

    this.debugContext?.debug.update();

    GlobalUniforms.uTime.value += RAF.delta;
  };

  handleResize = () => {
    RendererManager.resize();
    SceneManager.resize();
    CameraManager.resize();
  };

  destroy() {
    window.removeEventListener("resize", this.handleResize);

    RAF.destroy();
    SceneManager.destroy();
    CameraManager.destroy();
    Mouse.destroy();
    Accelerometer.destroy();
    Device.destroy();
    Input.destroy();
    Sound.destroy();
    RendererManager.destroy();
    this.debugContext?.debug.dispose();
    this.debugContext = null;
  }
}

export const Manager = new ManagerClass();
