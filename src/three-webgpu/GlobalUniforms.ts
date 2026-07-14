import { uniform } from "three/tsl";
import type { UniformNode } from "three/webgpu";
import { THREE } from "../three-adapter";

// Lazy-initialized uniforms to avoid accessing THREE before it's bound
let _uniforms: {
  uTime: UniformNode<number>;
  uScreen: UniformNode<THREE.Vector2>;
  uBackground: UniformNode<THREE.Color>;
  uPixelRatio: UniformNode<number>;
} | null = null;

function getUniforms() {
  if (!_uniforms) {
    _uniforms = {
      uTime: uniform(0),
      uScreen: uniform(new THREE.Vector2(0, 0)),
      uBackground: uniform(new THREE.Color("#dddbdc")),
      uPixelRatio: uniform(1),
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
