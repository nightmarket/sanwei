// GlobalUniforms adapter — core modules work with both WebGL and WebGPU uniforms.
// Bound by @nightmarket/sanwei/three or @nightmarket/sanwei/three-webgpu.
//
// Truly global uniforms (shared by every canvas) live here: uTime, uBackground.
// Per-canvas uniforms (uScreen, uPixelRatio) live on each SanweiApp instance and
// are created through the bound `createAppUniforms` factory.

export interface GlobalUniformsShape {
  uTime: { value: number };
  uBackground: { value: any };
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

let _globalUniforms: GlobalUniformsShape | null = null;
let _appUniformsFactory: (() => AppUniformsShape) | null = null;

export function bindGlobalUniforms(uniforms: GlobalUniformsShape) {
  _globalUniforms = uniforms;
}

export function bindAppUniformsFactory(factory: () => AppUniformsShape) {
  _appUniformsFactory = factory;
}

export function getGlobalUniforms(): GlobalUniformsShape {
  if (!_globalUniforms) {
    throw new Error(
      "GlobalUniforms not initialized. Import from '@nightmarket/sanwei/three' or '@nightmarket/sanwei/three-webgpu'."
    );
  }
  return _globalUniforms;
}

export function createAppUniforms(): AppUniformsShape {
  if (!_appUniformsFactory) {
    throw new Error(
      "App uniforms factory not bound. Import from '@nightmarket/sanwei/three' or '@nightmarket/sanwei/three-webgpu'."
    );
  }
  return _appUniformsFactory();
}

// Proxy so core modules can use GlobalUniforms at module scope before bind.
export const GlobalUniforms = new Proxy({} as GlobalUniformsShape, {
  get(_target, prop) {
    return getGlobalUniforms()[prop as keyof GlobalUniformsShape];
  },
});
