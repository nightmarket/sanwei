import fragmentShader from "./ruttEtra.frag.glsl";
import vertexShader from "./ruttEtra.vert.glsl";

export const RuttEtraShader = {
  uniforms: {
    tMap: { value: null, hideControls: true },
    displace: { value: 10, min: 0, max: 100 },
    originX: { value: 0, max: 2000, min: -2000 },
    originY: { value: 0, max: 2000, min: -2000 },
    originZ: { value: 0, max: 2000, min: -2000 },
    multiplier: { value: 100, min: 0, max: 1000 },
    opacity: { value: 1 },
    lineOffset: { value: 48, max: 100 },
    lineWidth: { value: 12, max: 100 },
    lineOrientation: { value: 1, max: 2 },
    mode: { value: 0 },
  },
  vertexShader,
  fragmentShader,
};
