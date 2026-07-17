import { BaseScene } from "../core/BaseScene";
import { Manager } from "../core/Manager";
import type { IPost } from "../core/types";
import { Post } from "./ThreePost";

export class BaseThreeScene extends BaseScene {
  protected async createPost(): Promise<IPost> {
    return await Manager.initClass(Post, this, this.sceneConfig.passes);
  }
}
