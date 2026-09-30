import { Vector2 } from "three";
import type { AppUniformsShape } from "../core/globalUniformsAdapter";

/** Shared by every canvas. `hideControls` keeps `addUniforms` from exposing the clock in pass configs. */
export const GlobalUniforms = {
  uTime: { hideControls: true, value: 0 },
};

/** Per-canvas uniforms — one set per SanweiApp. */
export function createAppUniforms(): AppUniformsShape {
  return {
    uScreen: { value: new Vector2() },
    uPixelRatio: { value: 1 },
  };
}
