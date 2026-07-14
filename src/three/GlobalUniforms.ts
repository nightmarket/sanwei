import { THREE } from "../three-adapter";

// Lazy-initialized uniforms to avoid accessing THREE before it's bound
let _uniforms: {
  uTime: { hideControls: boolean; value: number };
  uScreen: { hideControls: boolean; value: any };
  uBackground: { hideControls: boolean; value: any };
  uPixelRatio: { hideControls: boolean; value: number };
} | null = null;

function getUniforms() {
  if (!_uniforms) {
    _uniforms = {
      uTime: {
        hideControls: true,
        value: 0,
      },
      uScreen: {
        hideControls: true,
        value: new THREE.Vector2(),
      },
      uBackground: {
        hideControls: true,
        value: new THREE.Color("#dddbdc"),
      },
      uPixelRatio: {
        hideControls: true,
        value: 1,
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
