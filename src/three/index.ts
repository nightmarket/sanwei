// Bind THREE from standard three.js
import * as THREE from "three";
import { bindThree } from "../three-adapter";

bindThree(THREE);
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
export {
  CAMERA_MANAGER_UNIFORMS,
  CameraManager,
} from "../core/CameraManager";
export * from "../core/constants";
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
// Three.js specific exports
export { BaseThreeScene } from "./BaseThreeScene";
export { GlobalUniforms } from "./GlobalUniforms";
export { DEFAULT_PASS_CONFIG, Post } from "./ThreePost";
export { TransitionController } from "./TransitionController";
