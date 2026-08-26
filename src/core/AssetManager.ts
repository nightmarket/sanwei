import { THREE } from "../three-adapter";

import { isDebugEnabled } from "./constants";

class AssetManagerClass {
  isSingleton = true;

  private gltfLoader: any;
  private textureLoader: any;
  private loadingManager: any;

  async init() {
    this.loadingManager = new THREE.LoadingManager();

    if (isDebugEnabled()) {
      this.loadingManager.onProgress = (url: string, itemsLoaded: number, itemsTotal: number) => {
        console.log(`Loading file: ${url}.\nLoaded ${itemsLoaded} of ${itemsTotal} files.`);
      };
    }

    this.loadingManager.onError = (url: string) => {
      console.error(`There was an error loading ${url}`);
    };
  }

  /**
   * Load a GLTF/GLB. Pass the renderer that will draw the model when it may
   * contain KTX2 textures — compressed-texture support detection is
   * renderer-specific (first caller wins for the shared loader instance).
   */
  async loadModel(url: string, options: { onProgress?: (progress: number) => void; renderer?: any } = {}) {
    if (!this.gltfLoader) {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { DRACOLoader } = await import("three/addons/loaders/DRACOLoader.js");
      const { KTX2Loader } = await import("three/addons/loaders/KTX2Loader.js");

      const dracoLoader = new DRACOLoader(this.loadingManager);
      dracoLoader.setDecoderPath("./libs/draco/");

      const ktx2Loader = new KTX2Loader(this.loadingManager);
      ktx2Loader.setTranscoderPath("./libs/basis/");
      if (options.renderer) ktx2Loader.detectSupport(options.renderer);

      this.gltfLoader = new GLTFLoader(this.loadingManager);
      this.gltfLoader.setDRACOLoader(dracoLoader);
      this.gltfLoader.setKTX2Loader(ktx2Loader);
    }
    const gltf = await this.gltfLoader.loadAsync(url, options.onProgress);
    return gltf;
  }

  async loadTexture(url: string, onProgress?: (progress: number) => void) {
    if (!this.textureLoader) {
      this.textureLoader = new THREE.TextureLoader(this.loadingManager);
      this.textureLoader.setCrossOrigin("anonymous");
    }
    const texture = await this.textureLoader.loadAsync(url, onProgress);
    return texture;
  }
}

export const AssetManager = new AssetManagerClass();
