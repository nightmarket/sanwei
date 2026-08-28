// Bind THREE from three/webgpu
import * as THREE from "three/webgpu";
import { bindThree } from "../three-adapter";

bindThree(THREE as unknown as typeof import("three"));
THREE.Cache.enabled = true;

// Bind GlobalUniforms + per-app uniform factory for core modules
import { bindAppUniformsFactory, bindGlobalUniforms } from "../core/globalUniformsAdapter";
import { createAppUniforms, GlobalUniforms } from "./GlobalUniforms";

bindGlobalUniforms(GlobalUniforms);
bindAppUniformsFactory(createAppUniforms);

// Re-export THREE for consumers
export { THREE };

// Core modules
export { Accelerometer } from "../core/Accelerometer";
export { AssetManager } from "../core/AssetManager";
// WebGPU specific exports
export { BaseScene as BaseThreeWebGPUScene } from "../core/BaseScene";
export type { CameraConfig } from "../core/CameraController";
export { CameraController } from "../core/CameraController";
export {
  CAMERA_MANAGER_UNIFORMS,
  CameraManager,
} from "../core/CameraManager";
export * from "../core/constants";
export { Device } from "../core/Device";
export type { GpuTier, QualityPreset } from "../core/Device";
export type { AppUniformsShape } from "../core/globalUniformsAdapter";
export { Input } from "../core/Input";
export type { MouseDragState, MouseScrollState } from "../core/Mouse";
export { Mouse, SCROLL_DIRECTION } from "../core/Mouse";
export { RAF } from "../core/RAF";
export { RendererManager } from "../core/RendererManager";
export type { AppPointer, RectMode, SanweiAppOptions, TickDesire } from "../core/SanweiApp";
export { createSanweiApp, SanweiApp } from "../core/SanweiApp";
export { SceneManager } from "../core/SceneManager";
export { Sound } from "../core/Sound";
export type { IPost, IScene, ITransitionController } from "../core/types";
export { UIEmitter } from "../core/UIEmitter";
export { renderToTarget as withRenderTarget } from "../util/renderer";
export { createAppUniforms, GlobalUniforms } from "./GlobalUniforms";
export type { CreateWebGPURendererOptions } from "./createWebGPURenderer";
export { createWebGPURenderer, hasGpuRendererSupport } from "./createWebGPURenderer";
export type { TrailCompositeContext, TrailEffectOptions, TrailPresentContext } from "./post/TrailEffect";
export { TrailEffect } from "./post/TrailEffect";
export { TransitionController } from "./TransitionController";
