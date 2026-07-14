// ⚠️ IMPORTANT: For THREE-dependent modules, import from:
// - "@repo/sanwei/three" for standard Three.js (WebGL)
// - "@repo/sanwei/three-webgpu" for Three.js WebGPU
//
// These entry points bind the correct THREE module and re-export all core utilities.
//
// Example:
//   import { Manager, CameraManager, THREE } from "@repo/sanwei/three";
//   import { Manager, CameraManager, THREE } from "@repo/sanwei/three-webgpu";

// Only export modules that don't depend on THREE
export * from "./core/constants";
export { Debug } from "./core/Debug";
export { Input } from "./core/Input";
export { RAF } from "./core/RAF";
export { UIEmitter } from "./core/UIEmitter";
