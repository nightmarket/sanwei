import type { Scene } from "three";
import type { DebugContext } from "./debugHelpers";
import type { SanweiApp } from "./SanweiApp";

export interface IScene {
  scene: Scene;
  post?: IPost;
  /** Owning app — assigned by `SceneManager.addScenes` before `init()` runs. */
  app?: SanweiApp;

  init(): Promise<void>;
  initDebug?(context?: DebugContext): Promise<void>;
  resize(): void;
  render(): void;
  destroy(): void;
}

export interface IPost {
  enabled: boolean;

  init(): Promise<void>;
  initDebug?(context?: DebugContext): Promise<void>;
  resize(): void;
  update(): void;
  renderToTarget(target: any): void;
  dispose(): void;
}

export interface ITransitionController {
  progress: number;
  isActive: boolean;
  init(): void;
  start(fromScene: IScene, toScene: IScene): void;
  render(): void;
  stop(): void;
  resize(): void;
  destroy(): void;
}
