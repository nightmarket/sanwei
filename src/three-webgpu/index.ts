// Bind THREE from three/webgpu
import * as THREE from "three/webgpu";
import { bindThree } from "../three-adapter";

bindThree(THREE as unknown as typeof import("three"));
THREE.Cache.enabled = true;

// Bind GlobalUniforms for core modules
import { bindGlobalUniforms } from "../core/globalUniformsAdapter";
import { GlobalUniforms } from "./GlobalUniforms";

bindGlobalUniforms(GlobalUniforms);

// Re-export THREE for consumers
export { THREE };

// Core modules
export { Accelerometer } from "../core/Accelerometer";
export { AssetManager } from "../core/AssetManager";
// WebGPU specific exports
export { BaseScene as BaseThreeWebGPUScene } from "../core/BaseScene";
export {
  CAMERA_MANAGER_UNIFORMS,
  CameraManager,
} from "../core/CameraManager";
export * from "../core/constants";
export { Device } from "../core/Device";
export { Input } from "../core/Input";
export { IS_DEBUG, Manager } from "../core/Manager";
export type { MouseDragState, MouseScrollState } from "../core/Mouse";
export { Mouse, SCROLL_DIRECTION } from "../core/Mouse";
export { RAF } from "../core/RAF";
export { RendererManager } from "../core/RendererManager";
export { SceneManager } from "../core/SceneManager";
export { Sound } from "../core/Sound";
export type { IPost, IScene, ITransitionController } from "../core/types";
export { UIEmitter } from "../core/UIEmitter";
export { renderToTarget as withRenderTarget } from "../util/renderer";
export { GlobalUniforms } from "./GlobalUniforms";
export { TransitionController } from "./TransitionController";
