import { mix, texture, uniform, uv } from "three/tsl";
import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
} from "three/webgpu";
import type { SanweiApp } from "../core/SanweiApp";
import type { IScene } from "../core/types";
import { renderToTarget } from "../util/renderer";

const createTarget = (width: number, height: number) => {
  const target = new RenderTarget(width, height, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    type: HalfFloatType,
  });
  target.texture.colorSpace = SRGBColorSpace;
  return target;
};

/**
 * WebGPU-compatible transition controller.
 * Renders two scenes into offscreen targets and composites them
 * with a TSL crossfade node.
 *
 * Usage:
 *   transition.start(fromScene, toScene);
 *   // animate progress externally (GSAP, manual lerp, etc.)
 *   gsap.to(transition, { progress: 1, duration: 1, onComplete: () => {
 *     SceneManager.completeTransition();
 *   }});
 */
export class TransitionController {
  private rtFrom!: RenderTarget;
  private rtTo!: RenderTarget;
  private transitionScene!: Scene;
  private transitionCamera!: OrthographicCamera;
  private material!: MeshBasicNodeMaterial;
  private quadGeometry!: PlaneGeometry;
  private progressUniform = uniform(0);

  private fromScene: IScene | null = null;
  private toScene: IScene | null = null;
  private frameCounter = 0;

  get progress() {
    return this.progressUniform.value;
  }

  set progress(v: number) {
    this.progressUniform.value = v;
  }

  isActive = false;

  constructor(private app: SanweiApp) {}

  init() {
    const { x: w, y: h } = this.app.uniforms.uScreen.value;
    this.rtFrom = createTarget(w, h);
    this.rtTo = createTarget(w, h);

    // WebGPU render targets use top-left origin; uv().flipY() matches Three.js convention (see WebGPUTextureUtils).
    const uvFlipped = uv().flipY();
    const fromTex = texture(this.rtFrom.texture, uvFlipped);
    const toTex = texture(this.rtTo.texture, uvFlipped);

    this.material = new MeshBasicNodeMaterial({ transparent: true });
    this.material.colorNode = mix(fromTex, toTex, this.progressUniform);
    this.material.opacityNode = mix(fromTex.a, toTex.a, this.progressUniform);

    this.quadGeometry = new PlaneGeometry(2, 2);
    this.transitionScene = new Scene();
    this.transitionScene.add(new Mesh(this.quadGeometry, this.material));
    this.transitionCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Begin a transition between two scenes. */
  start(fromScene: IScene, toScene: IScene) {
    this.isActive = true;
    this.progress = 0;
    this.fromScene = fromScene;
    this.toScene = toScene;
    this.frameCounter = 0;

    // Both scenes must be visible during the transition
    fromScene.scene.visible = true;
    toScene.scene.visible = true;
  }

  /** Called each frame by SceneManager while a transition is active. */
  render() {
    const fromScene = this.fromScene;
    const toScene = this.toScene;
    if (!this.isActive || !fromScene || !toScene) return;

    const renderer = this.app.renderer;

    // Ping-pong: alternate between rendering scenes each frame
    if (this.frameCounter % 2 === 0) {
      renderToTarget(renderer, this.rtFrom, () => fromScene.render());
    } else {
      renderToTarget(renderer, this.rtTo, () => toScene.render());
    }

    this.frameCounter++;

    // Composite to screen
    renderer.render(this.transitionScene, this.transitionCamera);
  }

  /** Finalize the transition and clean up. */
  stop() {
    this.isActive = false;
    this.progress = 0;
    this.fromScene = null;
    this.toScene = null;
  }

  resize() {
    const { x: w, y: h } = this.app.uniforms.uScreen.value;
    this.rtFrom?.setSize(w, h);
    this.rtTo?.setSize(w, h);
  }

  destroy() {
    this.stop();
    this.rtFrom?.dispose();
    this.rtTo?.dispose();
    this.quadGeometry?.dispose();
    this.material?.dispose();
  }
}
