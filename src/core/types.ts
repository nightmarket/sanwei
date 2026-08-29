import type { Scene } from "three";
import type { DebugContext } from "./debugHelpers";
import type { SanweiApp } from "./SanweiApp";

export interface ISanweiPlugin {
  readonly name: string;
  /** Other plugin names that must be installed first. */
  dependencies?: string[];
  install(app: SanweiApp): void | Promise<void>;
  initDebug?(context: DebugContext): void | Promise<void>;
  dispose?(): void;
}

export type SanweiPluginCtor<T extends ISanweiPlugin = ISanweiPlugin> = new (
  ...args: any[]
) => T;
export type SanweiPluginInput = ISanweiPlugin | SanweiPluginCtor;
export type SanweiPluginId<T extends ISanweiPlugin = ISanweiPlugin> = string | SanweiPluginCtor<T>;

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
