import { mix, texture, uniform, uv } from "three/tsl";
import * as THREE from "three/webgpu";
import { GlobalUniforms } from "../core/globalUniformsAdapter";
import { RendererManager } from "../core/RendererManager";
import type { IScene } from "../core/types";
import { renderToTarget } from "../util/renderer";

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
  private rtFrom!: THREE.RenderTarget;
  private rtTo!: THREE.RenderTarget;
  private transitionScene!: THREE.Scene;
  private transitionCamera!: THREE.OrthographicCamera;
  private material!: THREE.MeshBasicNodeMaterial;
  private quadGeometry!: THREE.PlaneGeometry;
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

  init() {
    const { x: w, y: h } = GlobalUniforms.uScreen.value;

    this.rtFrom = new THREE.RenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });
    this.rtTo = new THREE.RenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    this.rtFrom.texture.colorSpace = THREE.SRGBColorSpace;
    this.rtTo.texture.colorSpace = THREE.SRGBColorSpace;

    // WebGPU render targets use top-left origin; uv().flipY() matches Three.js convention (see WebGPUTextureUtils).
    const uvFlipped = uv().flipY();

    // TSL crossfade: mix(fromTexture, toTexture, progress)
    const fromTex = texture(this.rtFrom.texture, uvFlipped);
    const toTex = texture(this.rtTo.texture, uvFlipped);

    this.material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
    });

    this.material.colorNode = mix(fromTex, toTex, this.progressUniform);
    this.material.opacityNode = mix(fromTex.a, toTex.a, this.progressUniform);

    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(this.quadGeometry, this.material);

    this.transitionScene = new THREE.Scene();
    this.transitionScene.add(quad);
    this.transitionCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Begin a transition between two scenes. */
  start(fromScene: IScene, toScene: IScene) {
    this.isActive = true;
    this.progress = 0;
    this.fromScene = fromScene;
    this.toScene = toScene;
    this.frameCounter = 0;

    // Both scenes must be visible during the transition
    if (fromScene.scene) fromScene.scene.visible = true;
    if (toScene.scene) toScene.scene.visible = true;
  }

  /** Called each frame by SceneManager while a transition is active. */
  render() {
    if (!this.isActive || !this.fromScene || !this.toScene) return;

    const renderer = RendererManager.renderer;

    // Ping-pong: alternate between rendering scenes each frame
    if (this.frameCounter % 2 === 0) {
      renderToTarget(renderer, this.rtFrom, () => this.fromScene!.render());
    } else {
      renderToTarget(renderer, this.rtTo, () => this.toScene!.render());
    }

    this.frameCounter++;

    // Composite to screen
    renderer.setRenderTarget(null);
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
    const { x: w, y: h } = GlobalUniforms.uScreen.value;
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
