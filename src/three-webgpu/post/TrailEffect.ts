import { positionGeometry, texture, uniform, uv, vec4 } from "three/tsl";
import {
  type Camera,
  ColorManagement,
  DepthTexture,
  HalfFloatType,
  Mesh,
  type Node,
  NodeMaterial,
  NormalBlending,
  QuadMesh,
  RenderTarget,
  type Scene,
  type TextureDataType,
  type TextureNode,
  type UniformNode,
  Vector2,
} from "three/webgpu";

export type TrailCompositeContext = {
  /** This frame's scene render and its depth buffer. */
  currentTex: TextureNode;
  currentDepthTex: TextureNode;
  /** Previous output of every layer, by layer index. */
  history: TextureNode[];
  screenSize: UniformNode<"vec2">;
  /** The `frames` passed to `update`. Per-step feedback (decay, advection) compounds by it so the
   * trail reads the same at any refresh rate. */
  frames: UniformNode<"float">;
};

export type TrailPresentContext = {
  /** Latest output of every layer, by layer index. */
  trail: TextureNode[];
  currentTex: TextureNode;
  currentDepthTex: TextureNode;
  /** Size of the trail targets in texels. */
  screenSize: UniformNode<"vec2">;
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
  /** Fragment depth for the present pass. When set, the trail is depth-tested against the bound
   * depth buffer (e.g. the scene just drawn into the same target), so whatever occludes it cuts
   * it off at that target's resolution and antialiasing rather than the trail's. */
  presentDepth?: (ctx: TrailPresentContext) => Node;
};

type TrailLayer = {
  comp: RenderTarget;
  old: RenderTarget;
  history: TextureNode;
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
  /** The present as a scene object: a full-screen triangle in clip space, drawn inside whichever render
   * includes it, after the objects it covers. Unlike `renderToScreen`, that costs no render pass of its
   * own, which on tile-based (mobile) GPUs would store and reload the whole target. Keep it out of the
   * scene `update` renders, e.g. on a camera layer that pass disables. */
  readonly presentMesh: Mesh;

  private renderer: TrailEffectOptions["renderer"];
  private getScreenSize: () => { x: number; y: number };
  private resolutionScale: number;
  private compositeFn: TrailEffectOptions["composite"];
  private presentFn: TrailEffectOptions["present"];
  private presentDepthFn: TrailEffectOptions["presentDepth"];

  private currentFrame: RenderTarget;
  private currentTexNode: TextureNode;
  private currentDepthTexNode: TextureNode;
  private layers: TrailLayer[];
  private uTrailScreen = uniform(new Vector2(1, 1));
  private uFrames = uniform(1);

  private presentMaterial = new NodeMaterial();
  private presentQuad = new QuadMesh(this.presentMaterial);

  constructor(options: TrailEffectOptions) {
    this.renderer = options.renderer;
    this.getScreenSize = options.getScreenSize;
    this.resolutionScale = options.resolutionScale ?? 0.5;
    this.compositeFn = options.composite;
    this.presentFn = options.present;
    this.presentDepthFn = options.presentDepth;

    const type = options.type ?? HalfFloatType;
    const depthTexture = new DepthTexture(1, 1);
    // three shares one render context between targets of the same format, type, samples and depth, and
    // rebuilds every pipeline when their color spaces differ. Its own frame buffer target (sRGB screens,
    // no MSAA) is tagged with the working space, so this one is too; it converts nothing either way.
    this.currentFrame = new RenderTarget(1, 1, { type, depthTexture });
    this.currentFrame.texture.colorSpace = ColorManagement.workingColorSpace;
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
        material,
        quad: new QuadMesh(material),
      };
    });
    this.activeLayers = this.layers.length;
    this.presentMesh = new Mesh(this.presentQuad.geometry, this.presentMaterial);
    this.presentMesh.frustumCulled = false;
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
      layer.material.name = `TrailEffect.Composite${i}`;
      layer.material.fragmentNode = this.compositeFn(
        {
          currentTex: this.currentTexNode,
          currentDepthTex: this.currentDepthTexNode,
          history,
          screenSize: this.uTrailScreen,
          frames: this.uFrames,
        },
        i
      );
      layer.quad.name = `TrailEffect${i}`;
    });

    const { presentMaterial } = this;
    const presentContext = {
      trail: history,
      currentTex: this.currentTexNode,
      currentDepthTex: this.currentDepthTexNode,
      screenSize: this.uTrailScreen,
    };
    presentMaterial.name = "TrailEffect.Present";
    presentMaterial.transparent = true;
    presentMaterial.depthWrite = false;
    presentMaterial.depthTest = this.presentDepthFn !== undefined;
    presentMaterial.blending = NormalBlending;
    presentMaterial.fragmentNode = this.presentFn(presentContext);
    if (this.presentDepthFn) presentMaterial.depthNode = this.presentDepthFn(presentContext);
    // `presentMesh` is drawn by a regular scene render, so its triangle is placed in clip space directly.
    presentMaterial.vertexNode = vec4(positionGeometry.xy, 0, 1);
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

  /** `frames` is the calling app's `frame.frames`. Every pass clears its own target as it starts, rather
   * than in a pass of its own. */
  update(scene: Scene, camera: Camera, frames: number) {
    const { renderer } = this;
    this.uFrames.value = frames;

    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.currentFrame);
    renderer.render(scene, camera);

    // Every active layer composites from the previous frame's histories before any of them swaps.
    for (let i = 0; i < this.activeLayers; i++) {
      const layer = this.layers[i];
      if (!layer) continue;
      renderer.setRenderTarget(layer.comp);
      layer.quad.render(renderer);
    }
    renderer.autoClear = autoClear;
    const { width, height } = this.currentFrame;
    for (let i = 0; i < this.activeLayers; i++) {
      const layer = this.layers[i];
      if (!layer) continue;
      [layer.old, layer.comp] = [layer.comp, layer.old];
      // The history this composite read, still at the size before a resize, is now the scratch target.
      if (layer.comp.width !== width || layer.comp.height !== height) layer.comp.setSize(width, height);
    }
    for (const layer of this.layers) layer.history.value = layer.old.texture;
  }

  renderToScreen() {
    this.presentQuad.render(this.renderer);
  }

  /** Keeps the trail through a resize: the history stays at its old size until the next `update`
   * composites it, sampled by screen UV, into a target at the new one. */
  resize() {
    const screen = this.getScreenSize();
    const width = Math.max(1, Math.ceil(screen.x * this.resolutionScale));
    const height = Math.max(1, Math.ceil(screen.y * this.resolutionScale));
    if (this.currentFrame.width === width && this.currentFrame.height === height) return;

    this.currentFrame.setSize(width, height);
    for (const layer of this.layers) layer.comp.setSize(width, height);
    this.uTrailScreen.value.set(width, height);
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
