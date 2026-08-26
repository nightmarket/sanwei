import type * as THREE from "three";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { LUTPass } from "three/addons/postprocessing/LUTPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { PassType } from "../core/constants";
import type { DebugContext } from "../core/debugHelpers";
import { RAF } from "../core/RAF";
import type { SanweiApp } from "../core/SanweiApp";
import type { IPost, IScene } from "../core/types";
import { addUniforms } from "../util/bindings";

export const DEFAULT_PASS_CONFIG = {
  [PassType.RENDER]: { enabled: true },
};

const SHADER_MODULES: Record<string, () => Promise<any>> = {
  [PassType.RADIAL_BLUR]: () =>
    import("../shaders/postprocessing/radialBlurShader/index.js").then((m) => m.RadialBlurShader),
  [PassType.COMPOSITE]: () =>
    import("../shaders/postprocessing/compositeShader/index.js").then((m) => m.CompositeShader),
  [PassType.DITHER]: () => import("../shaders/postprocessing/ditherShader/index.js").then((m) => m.DitherShader),
  [PassType.KUWAHARA]: () => import("../shaders/postprocessing/kuwaharaShader/index.js").then((m) => m.KuwaharaShader),
  [PassType.ASCII]: () => import("../shaders/postprocessing/ascii/index.js").then((m) => m.ASCIIShader),
};

async function loadShader(passType: string) {
  const loader = SHADER_MODULES[passType];
  if (!loader) {
    console.warn(`No shader module registered for pass type: ${passType}`);
    return null;
  }
  try {
    return await loader();
  } catch (error) {
    console.warn(`Failed to load pass ${passType}:`, error);
    return null;
  }
}

export class Post implements IPost {
  isSingleton = false;
  sceneClass: IScene;
  passConfig: Record<string, any>;
  passes: Record<string, any> = {};
  composer!: EffectComposer;
  enabled = true;

  constructor(sceneClass: IScene, passConfig = DEFAULT_PASS_CONFIG) {
    this.passConfig = passConfig;
    this.sceneClass = sceneClass;
  }

  /** Owning app, via the scene this post pipeline belongs to. */
  private get app(): SanweiApp {
    const app = this.sceneClass.app;
    if (!app) throw new Error("Post requires its scene to be registered with a SanweiApp before init()");
    return app;
  }

  async init() {
    this.composer = new EffectComposer(this.app.renderer);

    for (const [passType, config] of Object.entries(this.passConfig)) {
      await this.initPass(passType, config);
    }

    this.resize();
  }

  private async initPass(passType: string, config: any) {
    let pass: any;

    if (passType === PassType.RENDER) {
      pass = new RenderPass(this.sceneClass.scene, this.app.cameras.getActiveCamera());
    } else if (passType === PassType.BLOOM) {
      pass = new UnrealBloomPass(
        this.app.uniforms.uScreen.value as THREE.Vector2,
        config.uniforms.strength.value,
        config.uniforms.radius.value,
        config.uniforms.threshold.value
      );
    } else if (passType === PassType.SMAA) {
      pass = new SMAAPass();
    } else if (passType === PassType.LUT) {
      pass = new LUTPass();
    } else if (passType === PassType.AFTER_IMAGE) {
      pass = new AfterimagePass();
      pass.damp = config.uniforms?.damp?.value ?? 0.005;
    } else {
      const shader = await loadShader(passType);
      if (!shader) return;
      pass = new ShaderPass(shader);

      if (config.uniforms) {
        for (const [key, value] of Object.entries(config.uniforms)) {
          pass.uniforms[key] = value;
        }
      }
    }

    pass.enabled = !!config.enabled;
    this.passes[passType] = pass;
    this.composer.addPass(pass);
  }

  async initDebug({ debug, pane }: DebugContext) {
    const folder = pane.addFolder({
      title: "Postprocessing",
      expanded: true,
    });
    debug.register("Postprocessing", folder);

    folder.addBinding(this, "enabled");

    for (const [passType, config] of Object.entries(this.passConfig)) {
      const pass = this.passes[passType];
      if (!pass) continue;

      const subFolder = folder.addFolder({
        title: passType,
        expanded: true,
      });

      subFolder.addBinding(pass, "enabled", { label: `Enable ${passType}` }).on("change", (ev: any) => {
        pass.enabled = ev.value;
      });

      if (config.uniforms) {
        addUniforms(subFolder, config.uniforms);
      }
    }
  }

  resize() {
    const { x, y } = this.app.uniforms.uScreen.value;
    const pixelRatio = this.app.uniforms.uPixelRatio.value;
    this.composer.setSize(x / pixelRatio, y / pixelRatio);

    for (const pass of Object.values(this.passes)) {
      const resolution = pass.uniforms?.uResolution?.value;
      if (resolution?.set) resolution.set(x, y);
    }
  }

  /**
   * Render the post-processing pipeline to an offscreen target.
   * Used by TransitionController to capture scene output.
   */
  renderToTarget(target: THREE.WebGLRenderTarget) {
    const activeCamera = this.app.cameras.getActiveCamera();

    this.passes[PassType.RENDER].scene = this.sceneClass.scene;

    if (this.enabled) {
      this.passes[PassType.RENDER].camera = activeCamera;
      this.updatePassUniforms();

      // Redirect composer output to target
      const origRenderToScreen = this.composer.renderToScreen;
      const origRT1 = this.composer.renderTarget1;
      const origRT2 = this.composer.renderTarget2;

      this.composer.renderToScreen = false;
      this.composer.renderTarget2 = target;
      this.composer.writeBuffer = this.composer.renderTarget1;
      this.composer.readBuffer = target;

      this.composer.render(RAF.delta);

      // Restore
      this.composer.renderToScreen = origRenderToScreen;
      this.composer.renderTarget1 = origRT1;
      this.composer.renderTarget2 = origRT2;
      this.composer.writeBuffer = origRT1;
      this.composer.readBuffer = origRT2;
    } else {
      this.app.renderer.setRenderTarget(target);
      this.app.render(this.sceneClass.scene, activeCamera);
      this.app.renderer.setRenderTarget(null);
    }
  }

  /** Render the post-processing pipeline to the screen. */
  update() {
    const activeCamera = this.app.cameras.getActiveCamera();

    this.passes[PassType.RENDER].scene = this.sceneClass.scene;

    if (this.enabled) {
      this.passes[PassType.RENDER].camera = activeCamera;
      this.updatePassUniforms();
      this.composer.render(RAF.delta);
    } else {
      this.app.render(this.sceneClass.scene, activeCamera);
    }
  }

  /** Sync per-frame pass uniforms. */
  private updatePassUniforms() {
    if (this.passConfig[PassType.RADIAL_BLUR]?.enabled) {
      const rbPass = this.passes[PassType.RADIAL_BLUR];
      if (rbPass) {
        rbPass.uniforms.uRadialStrength.value = this.passConfig[PassType.RADIAL_BLUR].uniforms.uRadialStrength.value;
        rbPass.uniforms.tBright = rbPass.uniforms.tDiffuse;
      }
    }
  }

  enablePass(passType: string) {
    if (this.passes[passType]) this.passes[passType].enabled = true;
  }

  disablePass(passType: string) {
    if (this.passes[passType]) this.passes[passType].enabled = false;
  }

  togglePass(passType: string) {
    if (this.passes[passType]) this.passes[passType].enabled = !this.passes[passType].enabled;
  }

  dispose() {
    for (const pass of Object.values(this.passes)) pass.dispose?.();
    this.composer?.dispose();
    this.passes = {};
  }
}
