import type { Color, Vector2 } from "three";
import { uniform } from "three/tsl";
import type { UniformNode } from "three/webgpu";
import type { AppUniformsShape } from "../core/globalUniformsAdapter";
import { THREE } from "../three-adapter";

// Lazy-initialized uniforms to avoid accessing THREE before it's bound
let _uniforms: {
  uTime: UniformNode<number>;
  uBackground: UniformNode<Color>;
} | null = null;

function getUniforms() {
  if (!_uniforms) {
    _uniforms = {
      uTime: uniform(0),
      uBackground: uniform(new THREE.Color("#dddbdc")),
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

/** Per-canvas uniforms — one set per SanweiApp. TSL uniform nodes, usable directly in node materials. */
export function createAppUniforms(): AppUniformsShape & {
  uScreen: UniformNode<Vector2>;
  uPixelRatio: UniformNode<number>;
} {
  return {
    uScreen: uniform(new THREE.Vector2(0, 0)),
    uPixelRatio: uniform(1),
  };
}
