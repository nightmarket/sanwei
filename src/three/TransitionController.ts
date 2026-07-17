import { CameraManager } from "../core/CameraManager";
import { GlobalUniforms } from "../core/globalUniformsAdapter";
import { RendererManager } from "../core/RendererManager";
import type { IScene } from "../core/types";
import { THREE } from "../three-adapter";
import { renderToTarget } from "../util/renderer";

/**
 * Renders two scenes into offscreen targets and composites them
 * with a configurable transition shader.
 *
 * Usage:
 *   transition.start(fromScene, toScene);
 *   // animate progress externally (GSAP, manual lerp, etc.)
 *   gsap.to(transition, { progress: 1, duration: 1, onComplete: () => {
 *     SceneManager.completeTransition();
 *   }});
 */
export class TransitionController {
  private rtFrom: any;
  private rtTo: any;
  private transitionScene: any;
  private transitionCamera: any;
  private material: any;
  private quadGeometry: any;

  private fromScene: IScene | null = null;
  private toScene: IScene | null = null;
  private frameCounter = 0;

  progress = 0;
  isActive = false;

  init() {
    const { x: w, y: h } = GlobalUniforms.uScreen.value;

    this.rtFrom = new THREE.WebGLRenderTarget(w, h);
    this.rtTo = new THREE.WebGLRenderTarget(w, h);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tScene1: { value: null },
        tScene2: { value: null },
        uProgress: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tScene1;
        uniform sampler2D tScene2;
        uniform float uProgress;
        varying vec2 vUv;
        void main() {
          vec4 c1 = texture2D(tScene1, vUv);
          vec4 c2 = texture2D(tScene2, vUv);
          gl_FragColor = mix(c1, c2, uProgress);
        }
      `,
    });

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

    // Ping-pong: alternate between rendering scenes each frame
    const scene = this.frameCounter % 2 === 0 ? this.fromScene : this.toScene;
    const target = this.frameCounter % 2 === 0 ? this.rtFrom : this.rtTo;

    if (scene.post) {
      scene.post.renderToTarget(target);
    } else {
      renderToTarget(RendererManager.renderer, target, () => {
        RendererManager.render(scene.scene, CameraManager.getActiveCamera());
      });
    }

    this.frameCounter++;

    // Always composite to screen
    this.material.uniforms.tScene1.value = this.rtFrom.texture;
    this.material.uniforms.tScene2.value = this.rtTo.texture;
    this.material.uniforms.uProgress.value = this.progress;

    RendererManager.render(this.transitionScene, this.transitionCamera);
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
