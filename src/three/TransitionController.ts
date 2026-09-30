import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderTarget } from "three";
import type { SanweiApp } from "../core/SanweiApp";
import type { IScene } from "../core/types";
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
  private rtFrom!: WebGLRenderTarget;
  private rtTo!: WebGLRenderTarget;
  private transitionScene!: Scene;
  private transitionCamera!: OrthographicCamera;
  private material!: ShaderMaterial;
  private quadGeometry!: PlaneGeometry;

  private fromScene: IScene | null = null;
  private toScene: IScene | null = null;
  private frameCounter = 0;

  progress = 0;
  isActive = false;

  constructor(private app: SanweiApp) {}

  init() {
    const { x: w, y: h } = this.app.uniforms.uScreen.value;

    this.rtFrom = new WebGLRenderTarget(w, h);
    this.rtTo = new WebGLRenderTarget(w, h);

    this.material = new ShaderMaterial({
      uniforms: {
        tScene1: { value: this.rtFrom.texture },
        tScene2: { value: this.rtTo.texture },
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
    if (!this.isActive || !this.fromScene || !this.toScene) return;

    // Ping-pong: alternate between rendering scenes each frame
    const isFrom = this.frameCounter % 2 === 0;
    const scene = isFrom ? this.fromScene : this.toScene;
    const target = isFrom ? this.rtFrom : this.rtTo;

    if (scene.post) {
      scene.post.renderToTarget(target);
    } else {
      renderToTarget(this.app.renderer, target, () => {
        this.app.render(scene.scene, this.app.cameras.getActiveCamera());
      });
    }

    this.frameCounter++;

    // Always composite to screen
    this.material.uniforms.uProgress.value = this.progress;
    this.app.render(this.transitionScene, this.transitionCamera);
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
