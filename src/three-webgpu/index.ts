import { bindUniforms } from "../core/globalUniformsAdapter";
import { createAppUniforms, GlobalUniforms } from "./GlobalUniforms";

bindUniforms(GlobalUniforms, createAppUniforms);

export { BaseScene as BaseThreeWebGPUScene } from "../core/BaseScene";
export type { AppUniformsShape } from "../core/globalUniformsAdapter";
export {
  type AppPointer,
  createSanweiApp,
  type RectMode,
  SanweiApp,
  type SanweiAppOptions,
  type TickDesire,
} from "../core/SanweiApp";
export * from "../index";
export {
  type CreateWebGPURendererOptions,
  createWebGPURenderer,
  hasGpuRendererSupport,
  setOutputColorSpace,
} from "./createWebGPURenderer";
export { createAppUniforms, GlobalUniforms } from "./GlobalUniforms";
export {
  type TrailCompositeContext,
  TrailEffect,
  type TrailEffectOptions,
  type TrailPresentContext,
} from "./post/TrailEffect";
export { TransitionController } from "./TransitionController";
