import { CopyShader } from "three/examples/jsm/shaders/CopyShader.js";
import fragmentShader from "./frag.glsl";

export const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader,
};
