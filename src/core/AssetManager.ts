import { Cache, LoadingManager, TextureLoader, type WebGLRenderer } from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { WebGPURenderer } from "three/webgpu";
import { isDebugEnabled } from "./constants";

type ModelRenderer = WebGLRenderer | WebGPURenderer;

export type LoadModelOptions = {
  onProgress?: (event: ProgressEvent) => void;
  /** Decoder directory for `KHR_draco_mesh_compression` assets (e.g. `"/libs/draco/"`). */
  draco?: string;
  /** Transcoder directory for `KHR_texture_basisu` assets (e.g. `"/libs/basis/"`). Requires `renderer`. */
  ktx2?: string;
  /** Renderer that will draw the model — KTX2 support detection is renderer-specific. */
  renderer?: ModelRenderer;
};

class AssetManagerClass {
  isSingleton = true;

  private loadingManager = new LoadingManager();
  private textureLoader: TextureLoader | null = null;
  private gltfLoader: Promise<GLTFLoader> | null = null;

  init() {
    Cache.enabled = true;

    if (isDebugEnabled()) {
      this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        console.log(`Loading file: ${url}.\nLoaded ${itemsLoaded} of ${itemsTotal} files.`);
      };
    }

    this.loadingManager.onError = (url) => {
      console.error(`There was an error loading ${url}`);
    };
  }

  /**
   * Load a GLTF/GLB. Draco and KTX2 decoders are opt-in so plain models never
   * download them; the shared loader keeps the first decoder paths it is given.
   */
  async loadModel(url: string, { onProgress, draco, ktx2, renderer }: LoadModelOptions = {}) {
    const [loader] = await Promise.all([
      this.getGLTFLoader(),
      draco && this.attachDraco(draco),
      ktx2 && this.attachKTX2(ktx2, renderer),
    ]);
    return loader.loadAsync(url, onProgress);
  }

  private getGLTFLoader() {
    this.gltfLoader ??= import("three/addons/loaders/GLTFLoader.js").then(
      ({ GLTFLoader }) => new GLTFLoader(this.loadingManager)
    );
    return this.gltfLoader;
  }

  private async attachDraco(decoderPath: string) {
    const [loader, { DRACOLoader }] = await Promise.all([
      this.getGLTFLoader(),
      import("three/addons/loaders/DRACOLoader.js"),
    ]);
    if (loader.dracoLoader) return;
    loader.setDRACOLoader(new DRACOLoader(this.loadingManager).setDecoderPath(decoderPath));
  }

  private async attachKTX2(transcoderPath: string, renderer?: ModelRenderer) {
    const [loader, { KTX2Loader }] = await Promise.all([
      this.getGLTFLoader(),
      import("three/addons/loaders/KTX2Loader.js"),
    ]);
    if (loader.ktx2Loader) return;
    const ktx2Loader = new KTX2Loader(this.loadingManager).setTranscoderPath(transcoderPath);
    if (renderer) ktx2Loader.detectSupport(renderer);
    loader.setKTX2Loader(ktx2Loader);
  }

  async loadTexture(url: string, onProgress?: (event: ProgressEvent) => void) {
    if (!this.textureLoader) {
      this.textureLoader = new TextureLoader(this.loadingManager);
      this.textureLoader.setCrossOrigin("anonymous");
    }
    return this.textureLoader.loadAsync(url, onProgress);
  }
}

export const AssetManager = new AssetManagerClass();
