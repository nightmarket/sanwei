import { bindUniforms } from "../core/globalUniformsAdapter";
import { createAppUniforms, GlobalUniforms } from "./GlobalUniforms";

bindUniforms(GlobalUniforms, createAppUniforms);

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
export { BaseThreeScene } from "./BaseThreeScene";
export { createAppUniforms, GlobalUniforms } from "./GlobalUniforms";
export { DEFAULT_PASS_CONFIG, Post } from "./ThreePost";
export { TransitionController } from "./TransitionController";
