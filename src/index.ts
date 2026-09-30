// Renderer-agnostic runtime. Safe to import from DOM code: nothing here binds a
// renderer backend, so it never pulls in `three/webgpu`.
//
// Apps and scenes import from a backend entry, which re-exports everything here:
//   import { createSanweiApp } from "@nightmarket/sanwei/three";        // WebGL
//   import { createSanweiApp } from "@nightmarket/sanwei/three-webgpu"; // WebGPU

export { Accelerometer } from "./core/Accelerometer";
export { AssetManager, type LoadModelOptions } from "./core/AssetManager";
export { type CameraConfig, CameraController } from "./core/CameraController";
export { CAMERA_MANAGER_UNIFORMS, CameraManager } from "./core/CameraManager";
export * from "./core/constants";
export { Device, type GpuTier, type QualityPreset } from "./core/Device";
export { Input } from "./core/Input";
export { Mouse, type MouseDragState, type MouseScrollState, SCROLL_DIRECTION } from "./core/Mouse";
export { RAF } from "./core/RAF";
export { RendererManager } from "./core/RendererManager";
export { SceneManager } from "./core/SceneManager";
export { Sound } from "./core/Sound";
export type { IPost, IScene, ITransitionController } from "./core/types";
export { renderToTarget as withRenderTarget } from "./util/renderer";
