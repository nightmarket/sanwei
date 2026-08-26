import type { AppUniformsShape } from "../core/globalUniformsAdapter";
import { THREE } from "../three-adapter";

// Lazy-initialized uniforms to avoid accessing THREE before it's bound
let _uniforms: {
  uTime: { hideControls: boolean; value: number };
  uBackground: { hideControls: boolean; value: any };
} | null = null;

function getUniforms() {
  if (!_uniforms) {
    _uniforms = {
      uTime: {
        hideControls: true,
        value: 0,
      },
      uBackground: {
        hideControls: true,
        value: new THREE.Color("#dddbdc"),
      },
    };
  }
  return _uniforms;
}

// Export as a proxy so properties are accessed lazily
export const GlobalUniforms = new Proxy({} as ReturnType<typeof getUniforms>, {
  get(_target, prop) {
    return getUniforms()[prop as keyof ReturnType<typeof getUniforms>];
  },
});

/** Per-canvas uniforms — one set per SanweiApp. */
export function createAppUniforms(): AppUniformsShape {
  return {
    uScreen: { value: new THREE.Vector2() },
    uPixelRatio: { value: 1 },
  };
}
