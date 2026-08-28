import { THREE } from "../three-adapter";
import type { DebugContext } from "./debugHelpers";
import type { SanweiApp } from "./SanweiApp";
import type { IPost, IScene } from "./types";

/**
 * Base scene shared by WebGL and WebGPU renderers.
 *
 * Subclasses may override `createPost()` to provide a renderer-specific
 * post-processing pipeline, or handle post-processing directly.
 */
export class BaseScene implements IScene {
  scene: any; // THREE.Scene
  post?: IPost;
  sceneConfig: any;
  folder: any;
  /** Owning app — assigned by `SceneManager.addScenes` before `init()` runs. */
  app!: SanweiApp;

  constructor(sceneConfig: any) {
    this.scene = new THREE.Scene();
    this.sceneConfig = sceneConfig;
  }

  /** Factory method — subclasses may override to provide post-processing. */
  protected async createPost(): Promise<IPost | undefined> {
    return undefined;
  }

  async init() {
    this.post = await this.createPost();
  }

  async initDebug(_context?: DebugContext) {}

  resize() {
    this.post?.resize();
  }

  render() {
    this.post?.update();
  }

  destroy() {
    this.post?.dispose();

    this.scene.traverse((o: any) => {
      if (!o.isMesh) return;

      o.geometry?.dispose();

      const materials = Array.isArray(o.material) ? o.material : [o.material];

      for (const material of materials) {
        for (const key in material) {
          const value = material[key];
          if (value?.isTexture) value.dispose();
        }
        material.dispose();
      }
    });

    this.scene.clear();
  }
}
