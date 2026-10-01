import { texture, uniform, uv } from "three/tsl";
import {
  type Camera,
  DepthTexture,
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
  /** This frame's scene render and its depth buffer. */
  currentTex: TextureNode;
  currentDepthTex: TextureNode;
  /** Previous output of every layer, by layer index. */
  history: TextureNode[];
  screenSize: ReturnType<typeof uniform>;
};

export type TrailPresentContext = {
  /** Latest output of every layer, by layer index. */
  trail: TextureNode[];
  currentTex: TextureNode;
  currentDepthTex: TextureNode;
};

export type TrailEffectOptions = {
  renderer: any;
  getScreenSize: () => { x: number; y: number };
  resolutionScale?: number;
  /** Texel type of the trail targets. Half float by default: the trail is a feedback loop, and
   * 8-bit targets re-quantize it every frame, which bands smooth seeds and makes them shimmer. */
  type?: TextureDataType;
  /** Feedback layers, each with its own ping-ponged target and composite pass. Extra layers carry
   * data that doesn't fit beside the first (e.g. a colour per trail pixel). Default 1. */
  layers?: number;
  composite: (ctx: TrailCompositeContext, layer: number) => Node;
  present: (ctx: TrailPresentContext) => Node;
};

type TrailLayer = {
  comp: RenderTarget;
  old: RenderTarget;
  history: TextureNode;
  trail: TextureNode;
  material: NodeMaterial;
  quad: QuadMesh;
};

/**
 * Feedback trail: each frame renders the scene into `currentFrame`, composites
 * it with the previous result into ping-ponged history targets (one pair per
 * layer), and `renderToScreen` draws the accumulated trail over whatever is bound.
 */
export class TrailEffect {
  /** Layers from this index on skip their composite pass; their history goes stale until re-enabled. */
  activeLayers: number;

  private renderer: TrailEffectOptions["renderer"];
  private getScreenSize: () => { x: number; y: number };
  private resolutionScale: number;
  private compositeFn: TrailEffectOptions["composite"];
  private presentFn: TrailEffectOptions["present"];

  private currentFrame: RenderTarget;
  private currentTexNode: TextureNode;
  private currentDepthTexNode: TextureNode;
  private layers: TrailLayer[];
  private uTrailScreen = uniform(new Vector2(1, 1));

  private presentMaterial = new NodeMaterial();
  private presentQuad = new QuadMesh(this.presentMaterial);

  constructor(options: TrailEffectOptions) {
    this.renderer = options.renderer;
    this.getScreenSize = options.getScreenSize;
    this.resolutionScale = options.resolutionScale ?? 0.5;
    this.compositeFn = options.composite;
    this.presentFn = options.present;

    const type = options.type ?? HalfFloatType;
    const depthTexture = new DepthTexture(1, 1);
    this.currentFrame = new RenderTarget(1, 1, { type, depthTexture });
    this.currentTexNode = texture(this.currentFrame.texture);
    this.currentDepthTexNode = texture(depthTexture);
    this.layers = Array.from({ length: options.layers ?? 1 }, () => {
      const comp = new RenderTarget(1, 1, { type, depthBuffer: false });
      const old = new RenderTarget(1, 1, { type, depthBuffer: false });
      const material = new NodeMaterial();
      return {
        comp,
        old,
        history: texture(old.texture),
        trail: texture(old.texture),
        material,
        quad: new QuadMesh(material),
      };
    });
    this.activeLayers = this.layers.length;
  }

  init() {
    this.currentFrame.texture.name = "TrailEffect.current";
    const screenUv = uv();
    this.currentTexNode.uvNode = screenUv;
    this.currentDepthTexNode.uvNode = screenUv;

    const history = this.layers.map((layer) => layer.history);
    this.layers.forEach((layer, i) => {
      layer.comp.texture.name = `TrailEffect.comp${i}`;
      layer.old.texture.name = `TrailEffect.old${i}`;
      layer.history.uvNode = screenUv;
      layer.trail.uvNode = screenUv;
      layer.material.name = `TrailEffect.Composite${i}`;
      layer.material.fragmentNode = this.compositeFn(
        {
          currentTex: this.currentTexNode,
          currentDepthTex: this.currentDepthTexNode,
          history,
          screenSize: this.uTrailScreen,
        },
        i
      );
      layer.quad.name = `TrailEffect${i}`;
    });

    const { presentMaterial } = this;
    presentMaterial.name = "TrailEffect.Present";
    presentMaterial.transparent = true;
    presentMaterial.depthWrite = false;
    presentMaterial.depthTest = false;
    presentMaterial.blending = NormalBlending;
    presentMaterial.fragmentNode = this.presentFn({
      trail: this.layers.map((layer) => layer.trail),
      currentTex: this.currentTexNode,
      currentDepthTex: this.currentDepthTexNode,
    });
    this.presentQuad.name = "TrailEffectPresent";

    this.resize();
    this.clear();
  }

  clear() {
    const previous = this.renderer.getRenderTarget();
    for (const target of [this.currentFrame, ...this.layers.flatMap((layer) => [layer.comp, layer.old])]) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(previous);
  }

  update(scene: Scene, camera: Camera) {
    const active = this.layers.slice(0, this.activeLayers);
    for (const layer of this.layers) layer.history.value = layer.old.texture;

    this.renderer.setRenderTarget(this.currentFrame);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    for (const layer of active) {
      this.renderer.setRenderTarget(layer.comp);
      layer.quad.render(this.renderer);
    }
    for (const layer of active) [layer.old, layer.comp] = [layer.comp, layer.old];
  }

  renderToScreen() {
    for (const layer of this.layers) layer.trail.value = layer.old.texture;
    this.presentQuad.render(this.renderer);
  }

  resize() {
    const screen = this.getScreenSize();
    const width = Math.max(1, Math.ceil(screen.x * this.resolutionScale));
    const height = Math.max(1, Math.ceil(screen.y * this.resolutionScale));
    if (this.currentFrame.width === width && this.currentFrame.height === height) return;

    this.currentFrame.setSize(width, height);
    for (const layer of this.layers) {
      layer.comp.setSize(width, height);
      layer.old.setSize(width, height);
    }
    this.uTrailScreen.value.set(width, height);
    this.clear();
  }

  destroy() {
    this.currentFrame.dispose();
    for (const layer of this.layers) {
      layer.comp.dispose();
      layer.old.dispose();
      layer.material.dispose();
    }
    this.presentMaterial.dispose();
  }
}
