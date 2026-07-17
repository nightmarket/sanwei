// GlobalUniforms adapter — core modules work with both WebGL and WebGPU uniforms.
// Bound by @nightmarket/sanwei/three or @nightmarket/sanwei/three-webgpu.

export interface GlobalUniformsShape {
  uTime: { value: number };
  uScreen: {
    value: { x: number; y: number; set(x: number, y: number): void };
  };
  uBackground: { value: any };
  uPixelRatio: { value: number };
}

let _globalUniforms: GlobalUniformsShape | null = null;

export function bindGlobalUniforms(uniforms: GlobalUniformsShape) {
  _globalUniforms = uniforms;
}

export function getGlobalUniforms(): GlobalUniformsShape {
  if (!_globalUniforms) {
    throw new Error(
      "GlobalUniforms not initialized. Import from '@nightmarket/sanwei/three' or '@nightmarket/sanwei/three-webgpu'."
    );
  }
  return _globalUniforms;
}

// Proxy so core modules can use GlobalUniforms at module scope before bind.
export const GlobalUniforms = new Proxy({} as GlobalUniformsShape, {
  get(_target, prop) {
    return getGlobalUniforms()[prop as keyof GlobalUniformsShape];
  },
});
