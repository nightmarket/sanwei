import { THREE } from "../three-adapter";
import { IS_DEBUG, SHADOW_MAP_TYPES, TONE_MAPPING_TYPES } from "./constants";
import type { DebugContext } from "./debugHelpers";
import { GlobalUniforms } from "./globalUniformsAdapter";

const RendererManagerUniforms = {
  toneMappingExposure: {
    value: 0.3,
    min: 0,
    max: 1,
    step: 0.01,
    label: "Tone Mapping Exposure",
  },
  toneMapping: {
    value: TONE_MAPPING_TYPES.ACESFilmic,
  },
  shadowMapType: {
    value: SHADOW_MAP_TYPES.PCFSoft,
  },
  shadowMapEnabled: {
    value: true,
  },
};

// Lazy-initialized to avoid accessing THREE before it's bound
let _toneMappingTypes: Record<string, number> | null = null;
let _shadowMapTypes: Record<string, number> | null = null;

export function getToneMappingTypes() {
  if (!_toneMappingTypes) {
    _toneMappingTypes = {
      [TONE_MAPPING_TYPES.None]: THREE.NoToneMapping,
      [TONE_MAPPING_TYPES.Linear]: THREE.LinearToneMapping,
      [TONE_MAPPING_TYPES.Reinhard]: THREE.ReinhardToneMapping,
      [TONE_MAPPING_TYPES.Cineon]: THREE.CineonToneMapping,
      [TONE_MAPPING_TYPES.ACESFilmic]: THREE.ACESFilmicToneMapping,
      [TONE_MAPPING_TYPES.AgX]: THREE.AgXToneMapping,
      [TONE_MAPPING_TYPES.Neutral]: THREE.NeutralToneMapping,
    };
  }
  return _toneMappingTypes;
}

export function getShadowMapTypes() {
  if (!_shadowMapTypes) {
    _shadowMapTypes = {
      [SHADOW_MAP_TYPES.Basic]: THREE.BasicShadowMap,
      [SHADOW_MAP_TYPES.PCF]: THREE.PCFShadowMap,
      [SHADOW_MAP_TYPES.PCFSoft]: THREE.PCFSoftShadowMap,
    };
  }
  return _shadowMapTypes;
}

class RendererManagerClass {
  isSingleton = true;
  canvas: HTMLCanvasElement | null = null;
  renderer: any = null;
  /**
   * Optional in-shader exposure uniform (e.g. apps that tone-map in the
   * material/post graph with renderer.toneMapping = NoToneMapping).
   */
  exposureUniform: { value: number } | null = null;

  async init({ canvas, renderer }: { canvas: HTMLCanvasElement; renderer: any }) {
    this.canvas = canvas;
    this.renderer = renderer;

    this.resize();

    if (IS_DEBUG) {
      this.renderer.debug.checkShaderErrors = true;
      this.renderer.debug.onShaderError = (gl, program, vs, fs) => console.error(gl, program, vs, fs);
    }

    // this.renderer.info.autoReset = !IS_DEBUG;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.toneMapping = getToneMappingTypes()[RendererManagerUniforms.toneMapping.value];
    this.renderer.toneMappingExposure = RendererManagerUniforms.toneMappingExposure.value;
    this.renderer.shadowMap.type = getShadowMapTypes()[RendererManagerUniforms.shadowMapType.value];
    this.renderer.shadowMap.enabled = RendererManagerUniforms.shadowMapEnabled.value;
  }

  async initDebug({ debug, inspectorPane }: DebugContext) {
    if (!inspectorPane) return;

    const folder = inspectorPane.addFolder({
      title: "🖼️ Renderer",
      expanded: false,
    });
    debug.register("RendererManager", folder);

    folder
      .addBinding(RendererManagerUniforms.toneMappingExposure, "value", {
        label: "Tone Mapping Exposure",
        min: RendererManagerUniforms.toneMappingExposure.min,
        max: RendererManagerUniforms.toneMappingExposure.max,
        step: RendererManagerUniforms.toneMappingExposure.step,
      })
      .on("change", (ev: any) => {
        this.renderer.toneMappingExposure = ev.value;
        if (this.exposureUniform) this.exposureUniform.value = ev.value;
      });

    const toneParams = { toneMapping: RendererManagerUniforms.toneMapping.value };
    folder
      .addBinding(toneParams, "toneMapping", {
        label: "Tone Mapping",
        options: Object.fromEntries(Object.values(TONE_MAPPING_TYPES).map((type) => [type, type])),
      })
      .on("change", (ev: any) => {
        this.renderer.toneMapping = getToneMappingTypes()[ev.value];
      });

    const shadowParams = { shadowMapType: RendererManagerUniforms.shadowMapType.value };
    folder
      .addBinding(shadowParams, "shadowMapType", {
        label: "Shadow Map Type",
        options: Object.fromEntries(Object.values(SHADOW_MAP_TYPES).map((type) => [type, type])),
      })
      .on("change", (ev: any) => {
        this.renderer.shadowMap.type = getShadowMapTypes()[ev.value];
        this.renderer.shadowMap.needsUpdate = true;
      });

    folder
      .addBinding(RendererManagerUniforms.shadowMapEnabled, "value", {
        label: "Shadow Map Enabled",
      })
      .on("change", (ev: any) => {
        this.renderer.shadowMap.enabled = ev.value;
      });
  }

  resize() {
    if (!this.canvas?.parentElement) return;

    const width = this.canvas.parentElement.clientWidth;
    const height = this.canvas.parentElement.clientHeight;

    this.renderer.setPixelRatio(GlobalUniforms.uPixelRatio.value);
    this.renderer.setSize(width, height);
    GlobalUniforms.uScreen.value.set(
      width * GlobalUniforms.uPixelRatio.value,
      height * GlobalUniforms.uPixelRatio.value
    );
  }

  render(scene: any, camera: any) {
    this.renderer.render(scene, camera);
  }

  destroy() {
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
  }
}

export const RendererManager = new RendererManagerClass();
