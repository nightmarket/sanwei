import { BaseScene } from "../core/BaseScene";
import type { IPost } from "../core/types";
import { Post } from "./ThreePost";

export class BaseThreeScene extends BaseScene {
  protected async createPost(): Promise<IPost> {
    return await this.app.initClass(Post, this, this.sceneConfig.passes);
  }
}
