import { Cache, LoadingManager, TextureLoader, type WebGLRenderer } from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { WebGPURenderer } from "three/webgpu";
import { isDebugEnabled } from "./constants";

type ModelRenderer = WebGLRenderer | WebGPURenderer;

/** Decoders a model needs: Draco, KTX2 and meshopt are opt-in so plain models never download them. */
export type ModelDecoderOptions = {
  /** Decoder directory for `KHR_draco_mesh_compression` assets (e.g. `"/libs/draco/"`). */
  draco?: string;
  /** Transcoder directory for `KHR_texture_basisu` assets (e.g. `"/libs/basis/"`). Requires `renderer`. */
  ktx2?: string;
  /** Decode `EXT_meshopt_compression` assets. The decoder is bundled with three.js, so there's no path. */
  meshopt?: boolean;
  /** Renderer that will draw the model — KTX2 support detection is renderer-specific. */
  renderer?: ModelRenderer;
};

export type LoadModelOptions = ModelDecoderOptions & {
  onProgress?: (event: ProgressEvent) => void;
};

class AssetManagerClass {
  isSingleton = true;

  private loadingManager = new LoadingManager();
  private textureLoader: TextureLoader | null = null;
  private gltfLoader: Promise<GLTFLoader> | null = null;

  init() {
    Cache.enabled = true;

    if (isDebugEnabled()) {
      // Nested loaders report the same URL more than once (GLTFLoader and its FileLoader both do).
      const logged = new Set<string>();
      this.loadingManager.onProgress = (url) => {
        if (logged.has(url)) return;
        logged.add(url);
        console.log(`Loaded file: ${url}`);
      };
    }

    this.loadingManager.onError = (url) => {
      console.error(`There was an error loading ${url}`);
    };
  }

  /**
   * Load a GLTF/GLB. The shared loader keeps the first decoder paths it is given.
   */
  async loadModel(url: string, { onProgress, ...decoders }: LoadModelOptions = {}) {
    const loader = await this.getModelLoader(decoders);
    return loader.loadAsync(url, onProgress);
  }

  /** Parse a GLB that's already downloaded, e.g. one the page fetched for another use. */
  async parseModel(data: ArrayBuffer, decoders: ModelDecoderOptions = {}) {
    const loader = await this.getModelLoader(decoders);
    return loader.parseAsync(data, "");
  }

  private async getModelLoader({ draco, ktx2, meshopt, renderer }: ModelDecoderOptions) {
    const [loader] = await Promise.all([
      this.getGLTFLoader(),
      draco && this.attachDraco(draco),
      ktx2 && this.attachKTX2(ktx2, renderer),
      meshopt && this.attachMeshopt(),
    ]);
    return loader;
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

  private async attachMeshopt() {
    const [loader, { MeshoptDecoder }] = await Promise.all([
      this.getGLTFLoader(),
      import("three/addons/libs/meshopt_decoder.module.js"),
    ]);
    loader.setMeshoptDecoder(MeshoptDecoder);
  }

  /** Resolves once the image is decoded as well as loaded, so its first upload doesn't decode it on the
   * main thread mid-frame. */
  async loadTexture(url: string, onProgress?: (event: ProgressEvent) => void) {
    if (!this.textureLoader) {
      this.textureLoader = new TextureLoader(this.loadingManager);
      this.textureLoader.setCrossOrigin("anonymous");
    }
    const texture = await this.textureLoader.loadAsync(url, onProgress);
    await texture.image.decode();
    return texture;
  }
}

export const AssetManager = new AssetManagerClass();
