import { type Material, type Mesh, Scene } from "three";
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
  scene = new Scene();
  post?: IPost;
  sceneConfig: any;
  /** Owning app — assigned by `SceneManager.addScenes` before `init()` runs. */
  app!: SanweiApp;

  constructor(sceneConfig: any) {
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

    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;

      mesh.geometry?.dispose();

      const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose();
        }
        material.dispose();
      }
    });

    this.scene.clear();
  }
}
