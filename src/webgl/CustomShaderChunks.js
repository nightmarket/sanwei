import * as THREE from "three";

import MAP from "../shaders/chunks/MAP.glsl";
import REVEAL from "../shaders/chunks/REVEAL.glsl";

// Stubs for app-specific chunks — uncomment and point at local GLSL as needed:
// import FOG_FRAG_UNIFORMS from "../shaders/chunks/FOG_FRAG_UNIFORMS.glsl";
// import BUMP_FRAG_UNIFORMS from "../shaders/chunks/BUMP_FRAG_UNIFORMS.glsl";
// import HALO_FRAG_UNIFORMS from "../shaders/chunks/HALO_FRAG_UNIFORMS.glsl";
// import HALO_FRAG from "../shaders/chunks/HALO_FRAG.glsl";
// import SNOISE_3D from "../shaders/chunks/SNOISE_3D.glsl";
// import HIDE_FRONT_FRAG from "../shaders/chunks/HIDE_FRONT_FRAG.glsl";
// import SPROUT_VERT_UNIFORMS from "../shaders/chunks/SPROUT_VERT_UNIFORMS.glsl";
// import SPROUT_VERT from "../shaders/chunks/SPROUT_VERT.glsl";

THREE.ShaderChunk.MAP = MAP;
THREE.ShaderChunk.REVEAL = REVEAL;
// THREE.ShaderChunk.FOG_FRAG_UNIFORMS = FOG_FRAG_UNIFORMS;
// THREE.ShaderChunk.BUMP_FRAG_UNIFORMS = BUMP_FRAG_UNIFORMS;
// THREE.ShaderChunk.HALO_FRAG = HALO_FRAG;
// THREE.ShaderChunk.HALO_FRAG_UNIFORMS = HALO_FRAG_UNIFORMS;
// THREE.ShaderChunk.SNOISE_3D = SNOISE_3D;
// THREE.ShaderChunk.HIDE_FRONT_FRAG = HIDE_FRONT_FRAG;
// THREE.ShaderChunk.SPROUT_VERT = SPROUT_VERT;
// THREE.ShaderChunk.SPROUT_VERT_UNIFORMS = SPROUT_VERT_UNIFORMS;
