// Backend uniforms — core modules work with both WebGL and WebGPU uniforms.
// Bound by @nightmarket/sanwei/three or @nightmarket/sanwei/three-webgpu.
//
// Truly global uniforms (shared by every canvas) live on the backend's
// `GlobalUniforms`. Per-canvas uniforms (uScreen, uPixelRatio) live on each
// SanweiApp instance and are created through the bound factory.

export interface GlobalUniformsShape {
  uTime: { value: number };
}

/**
 * A per-app uniform. WebGL binds plain `{ value }` objects; WebGPU binds TSL
 * uniform nodes — the open index signature admits node methods (`.x`, `.mul`,
 * …) without core depending on a backend.
 */
export type AppUniform<T> = { value: T } & { [key: string]: any };

/** Per-app (per-canvas) uniforms. */
export interface AppUniformsShape {
  uScreen: AppUniform<{ x: number; y: number; set(x: number, y: number): void }>;
  uPixelRatio: AppUniform<number>;
}

const UNBOUND_ERROR =
  "No renderer backend bound. Import from '@nightmarket/sanwei/three' or '@nightmarket/sanwei/three-webgpu' before creating a SanweiApp.";

let globalUniforms: GlobalUniformsShape | null = null;
let appUniformsFactory: (() => AppUniformsShape) | null = null;

export function bindUniforms(globals: GlobalUniformsShape, createApp: () => AppUniformsShape) {
  globalUniforms = globals;
  appUniformsFactory = createApp;
}

export function getGlobalUniforms(): GlobalUniformsShape {
  if (!globalUniforms) throw new Error(UNBOUND_ERROR);
  return globalUniforms;
}

export function createAppUniforms(): AppUniformsShape {
  if (!appUniformsFactory) throw new Error(UNBOUND_ERROR);
  return appUniformsFactory();
}
