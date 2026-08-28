import { texture, uniform, uv } from "three/tsl";
import {
  type Camera,
  type Node,
  NodeMaterial,
  NormalBlending,
  QuadMesh,
  RenderTarget,
  type Scene,
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
  composite: (ctx: TrailCompositeContext) => Node;
  present: (ctx: TrailPresentContext) => Node;
};

export class TrailEffect {
  private renderer: TrailEffectOptions["renderer"];
  private getScreenSize: () => { x: number; y: number };
  private resolutionScale: number;
  private compositeFn: TrailEffectOptions["composite"];
  private presentFn: TrailEffectOptions["present"];

  private currentFrame = new RenderTarget(1, 1);
  private compRT = new RenderTarget(1, 1, { depthBuffer: false });
  private oldRT = new RenderTarget(1, 1, { depthBuffer: false });

  private currentTexNode = texture(this.currentFrame.texture);
  private historyTexNode = texture(this.oldRT.texture);
  private trailTexNode = texture(this.oldRT.texture);

  private compositeMaterial: NodeMaterial | null = null;
  private presentMaterial: NodeMaterial | null = null;
  private quadMesh = new QuadMesh();
  private uTrailScreen = uniform(new Vector2(1, 1));

  constructor(options: TrailEffectOptions) {
    this.renderer = options.renderer;
    this.getScreenSize = options.getScreenSize;
    this.resolutionScale = options.resolutionScale ?? 0.5;
    this.compositeFn = options.composite;
    this.presentFn = options.present;
  }

  async init() {
    this.currentFrame.texture.name = "TrailEffect.current";
    this.compRT.texture.name = "TrailEffect.comp";
    this.oldRT.texture.name = "TrailEffect.old";
    this.currentTexNode.uvNode = uv();
    this.historyTexNode.uvNode = this.currentTexNode.uvNode;
    this.trailTexNode.uvNode = this.currentTexNode.uvNode;
    this.setupMaterials();
    this.resize();
    this.clear();
  }

  private setupMaterials() {
    const ctx: TrailCompositeContext = {
      currentTex: this.currentTexNode,
      historyTex: this.historyTexNode,
      screenSize: this.uTrailScreen,
    };

    let compositeMaterial = this.compositeMaterial;
    if (!compositeMaterial) {
      compositeMaterial = new NodeMaterial();
      this.compositeMaterial = compositeMaterial;
    }
    compositeMaterial.name = "TrailEffect.Composite";
    compositeMaterial.fragmentNode = this.compositeFn(ctx);

    let presentMaterial = this.presentMaterial;
    if (!presentMaterial) {
      presentMaterial = new NodeMaterial();
      this.presentMaterial = presentMaterial;
    }
    presentMaterial.name = "TrailEffect.Present";
    presentMaterial.transparent = true;
    presentMaterial.depthWrite = false;
    presentMaterial.depthTest = false;
    presentMaterial.blending = NormalBlending;
    presentMaterial.fragmentNode = this.presentFn({ trailTex: this.trailTexNode });
  }

  clear() {
    const previous = this.renderer.getRenderTarget?.() ?? null;
    for (const target of [this.currentFrame, this.compRT, this.oldRT]) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(previous);
  }

  private setTrailSize(width: number, height: number) {
    this.currentFrame.setSize(width, height);
    this.compRT.setSize(width, height);
    this.oldRT.setSize(width, height);
    this.uTrailScreen.value.set(width, height);
  }

  update(scene: Scene, camera: Camera) {
    if (!this.compositeMaterial) return;

    this.currentTexNode.value = this.currentFrame.texture;
    this.historyTexNode.value = this.oldRT.texture;

    this.renderer.setRenderTarget(this.currentFrame);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    this.quadMesh.material = this.compositeMaterial;
    this.quadMesh.name = "TrailEffect";
    this.renderer.setRenderTarget(this.compRT);
    this.quadMesh.render(this.renderer as any);

    [this.oldRT, this.compRT] = [this.compRT, this.oldRT];
  }

  renderToScreen() {
    if (!this.presentMaterial) return;

    this.trailTexNode.value = this.oldRT.texture;
    this.quadMesh.material = this.presentMaterial;
    this.quadMesh.name = "TrailEffectPresent";
    this.quadMesh.render(this.renderer as any);
  }

  resize() {
    const screen = this.getScreenSize();
    const width = Math.max(1, Math.ceil(screen.x * this.resolutionScale));
    const height = Math.max(1, Math.ceil(screen.y * this.resolutionScale));
    if (this.currentFrame.width === width && this.currentFrame.height === height) return;
    this.setTrailSize(width, height);
    this.clear();
  }

  destroy() {
    this.currentFrame.dispose();
    this.compRT.dispose();
    this.oldRT.dispose();
    this.compositeMaterial?.dispose();
    this.presentMaterial?.dispose();
  }
}
