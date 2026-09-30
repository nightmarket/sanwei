import { uniform } from "three/tsl";
import { Vector2 } from "three/webgpu";

/** Shared by every canvas. TSL uniform nodes, usable directly in node materials. */
export const GlobalUniforms = {
  uTime: uniform(0),
};

/** Per-canvas uniforms — one set per SanweiApp. */
export function createAppUniforms() {
  return {
    uScreen: uniform(new Vector2()),
    uPixelRatio: uniform(1),
  };
}
