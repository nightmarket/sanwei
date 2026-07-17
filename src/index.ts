// For THREE-dependent modules, import from:
// - "@nightmarket/sanwei/three" for standard Three.js (WebGL)
// - "@nightmarket/sanwei/three-webgpu" for Three.js WebGPU
//
// Those entry points bind THREE and re-export core utilities.
//
//   import { Manager, CameraManager, THREE } from "@nightmarket/sanwei/three";
//   import { Manager, CameraManager, THREE } from "@nightmarket/sanwei/three-webgpu";

// Modules that do not depend on a THREE binding.
export * from "./core/constants";
export { Input } from "./core/Input";
export { RAF } from "./core/RAF";
export { UIEmitter } from "./core/UIEmitter";
