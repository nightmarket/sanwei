import { texture, uniform, uv } from "three/tsl";
import {
  type Camera,
  HalfFloatType,
  type Node,
  NodeMaterial,
  NormalBlending,
  QuadMesh,
  RenderTarget,
  type Scene,
  type TextureDataType,
  Vector2,
} from "three/webgpu";

type TextureNode = ReturnType<typeof texture>;

export type TrailCompositeContext = {
  currentTex: TextureNode;
  historyTex: TextureNode;
  screenSize: ReturnType<typeof uniform>;
};

export type TrailPresentContext = {
  trailTex: TextureNode;
};

export type TrailEffectOptions = {
  renderer: any;
  getScreenSize: () => { x: number; y: number };
  resolutionScale?: number;
  /** Texel type of the trail targets. Half float by default: the trail is a feedback loop, and
   * 8-bit targets re-quantize it every frame, which bands smooth seeds and makes them shimmer. */
  type?: TextureDataType;
  composite: (ctx: TrailCompositeContext) => Node;
  present: (ctx: TrailPresentContext) => Node;
};

/**
 * Feedback trail: each frame renders the scene into `currentFrame`, composites
 * it with the previous result into a ping-ponged history target, and
 * `renderToScreen` draws the accumulated trail over whatever is bound.
 */
export class TrailEffect {
  private renderer: TrailEffectOptions["renderer"];
  private getScreenSize: () => { x: number; y: number };
  private resolutionScale: number;
  private compositeFn: TrailEffectOptions["composite"];
  private presentFn: TrailEffectOptions["present"];

  private currentFrame: RenderTarget;
  private compRT: RenderTarget;
  private oldRT: RenderTarget;

  private currentTexNode: TextureNode;
  private historyTexNode: TextureNode;
  private trailTexNode: TextureNode;
  private uTrailScreen = uniform(new Vector2(1, 1));

  private compositeMaterial = new NodeMaterial();
  private presentMaterial = new NodeMaterial();
  private compositeQuad = new QuadMesh(this.compositeMaterial);
  private presentQuad = new QuadMesh(this.presentMaterial);

  constructor(options: TrailEffectOptions) {
    this.renderer = options.renderer;
    this.getScreenSize = options.getScreenSize;
    this.resolutionScale = options.resolutionScale ?? 0.5;
    this.compositeFn = options.composite;
    this.presentFn = options.present;

    const type = options.type ?? HalfFloatType;
    this.currentFrame = new RenderTarget(1, 1, { type });
    this.compRT = new RenderTarget(1, 1, { type, depthBuffer: false });
    this.oldRT = new RenderTarget(1, 1, { type, depthBuffer: false });
    this.currentTexNode = texture(this.currentFrame.texture);
    this.historyTexNode = texture(this.oldRT.texture);
    this.trailTexNode = texture(this.oldRT.texture);
  }

  init() {
    this.currentFrame.texture.name = "TrailEffect.current";
    this.compRT.texture.name = "TrailEffect.comp";
    this.oldRT.texture.name = "TrailEffect.old";
    this.currentTexNode.uvNode = uv();
    this.historyTexNode.uvNode = this.currentTexNode.uvNode;
    this.trailTexNode.uvNode = this.currentTexNode.uvNode;

    this.compositeMaterial.name = "TrailEffect.Composite";
    this.compositeMaterial.fragmentNode = this.compositeFn({
      currentTex: this.currentTexNode,
      historyTex: this.historyTexNode,
      screenSize: this.uTrailScreen,
    });
    this.compositeQuad.name = "TrailEffect";

    const { presentMaterial } = this;
    presentMaterial.name = "TrailEffect.Present";
    presentMaterial.transparent = true;
    presentMaterial.depthWrite = false;
    presentMaterial.depthTest = false;
    presentMaterial.blending = NormalBlending;
    presentMaterial.fragmentNode = this.presentFn({ trailTex: this.trailTexNode });
    this.presentQuad.name = "TrailEffectPresent";

    this.resize();
    this.clear();
  }

  clear() {
    const previous = this.renderer.getRenderTarget();
    for (const target of [this.currentFrame, this.compRT, this.oldRT]) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(previous);
  }

  update(scene: Scene, camera: Camera) {
    this.currentTexNode.value = this.currentFrame.texture;
    this.historyTexNode.value = this.oldRT.texture;

    this.renderer.setRenderTarget(this.currentFrame);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    this.renderer.setRenderTarget(this.compRT);
    this.compositeQuad.render(this.renderer);

    [this.oldRT, this.compRT] = [this.compRT, this.oldRT];
  }

  renderToScreen() {
    this.trailTexNode.value = this.oldRT.texture;
    this.presentQuad.render(this.renderer);
  }

  resize() {
    const screen = this.getScreenSize();
    const width = Math.max(1, Math.ceil(screen.x * this.resolutionScale));
    const height = Math.max(1, Math.ceil(screen.y * this.resolutionScale));
    if (this.currentFrame.width === width && this.currentFrame.height === height) return;

    this.currentFrame.setSize(width, height);
    this.compRT.setSize(width, height);
    this.oldRT.setSize(width, height);
    this.uTrailScreen.value.set(width, height);
    this.clear();
  }

  destroy() {
    this.currentFrame.dispose();
    this.compRT.dispose();
    this.oldRT.dispose();
    this.compositeMaterial.dispose();
    this.presentMaterial.dispose();
  }
}
