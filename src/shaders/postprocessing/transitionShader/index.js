import fragmentShader from "./frag.glsl";
import vertexShader from "./vert.glsl";

export const TransitionShader = {
  uniforms: {
    tScene1: { value: null },
    tScene2: { value: null },
    uProgress: { value: 0.0 },
  },
  vertexShader,
  fragmentShader,
};
