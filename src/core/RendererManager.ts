import { THREE } from "../three-adapter";
import { isDebugEnabled, SHADOW_MAP_TYPES, TONE_MAPPING_TYPES } from "./constants";
import type { DebugContext } from "./debugHelpers";
import type { AppUniformsShape } from "./globalUniformsAdapter";

const RENDERER_UNIFORM_DEFAULTS = {
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

/** Per-app renderer wrapper: owns the canvas/renderer pair, sizing, and renderer debug bindings. */
export class RendererManager {
  canvas: HTMLCanvasElement | null = null;
  renderer: any = null;
  /**
   * Optional in-shader exposure uniform (e.g. apps that tone-map in the
   * material/post graph with renderer.toneMapping = NoToneMapping).
   */
  exposureUniform: { value: number } | null = null;

  private settings = structuredClone(RENDERER_UNIFORM_DEFAULTS);

  constructor(
    private uniforms: AppUniformsShape,
    private name = ""
  ) {}

  init({ canvas, renderer }: { canvas: HTMLCanvasElement; renderer: any }) {
    this.canvas = canvas;
    this.renderer = renderer;

    this.resize();

    if (isDebugEnabled()) {
      this.renderer.debug.checkShaderErrors = true;
      this.renderer.debug.onShaderError = (gl: any, program: any, vs: any, fs: any) =>
        console.error(gl, program, vs, fs);
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.toneMapping = getToneMappingTypes()[this.settings.toneMapping.value];
    this.renderer.toneMappingExposure = this.settings.toneMappingExposure.value;
    this.renderer.shadowMap.type = getShadowMapTypes()[this.settings.shadowMapType.value];
    this.renderer.shadowMap.enabled = this.settings.shadowMapEnabled.value;
  }

  async initDebug({ debug, inspectorPane }: DebugContext) {
    if (!inspectorPane) return;

    const title = this.name ? `🖼️ ${this.name} Renderer` : "🖼️ Renderer";
    const folder = inspectorPane.addFolder({
      title,
      expanded: false,
    });
    debug.register(this.name ? `RendererManager:${this.name}` : "RendererManager", folder);

    folder
      .addBinding(this.settings.toneMappingExposure, "value", {
        label: "Tone Mapping Exposure",
        min: this.settings.toneMappingExposure.min,
        max: this.settings.toneMappingExposure.max,
        step: this.settings.toneMappingExposure.step,
      })
      .on("change", (ev: any) => {
        this.renderer.toneMappingExposure = ev.value;
        if (this.exposureUniform) this.exposureUniform.value = ev.value;
      });

    const toneParams = { toneMapping: this.settings.toneMapping.value };
    folder
      .addBinding(toneParams, "toneMapping", {
        label: "Tone Mapping",
        options: Object.fromEntries(Object.values(TONE_MAPPING_TYPES).map((type) => [type, type])),
      })
      .on("change", (ev: any) => {
        this.renderer.toneMapping = getToneMappingTypes()[ev.value];
      });

    const shadowParams = { shadowMapType: this.settings.shadowMapType.value };
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
      .addBinding(this.settings.shadowMapEnabled, "value", {
        label: "Shadow Map Enabled",
      })
      .on("change", (ev: any) => {
        this.renderer.shadowMap.enabled = ev.value;
      });
  }

  /** Returns false while the canvas parent has no area (e.g. a collapsed panel). */
  resize(): boolean {
    if (!this.canvas?.parentElement) return false;

    const width = this.canvas.parentElement.clientWidth;
    const height = this.canvas.parentElement.clientHeight;
    if (width === 0 || height === 0) return false;

    this.renderer.setPixelRatio(this.uniforms.uPixelRatio.value);
    this.renderer.setSize(width, height);
    this.uniforms.uScreen.value.set(width * this.uniforms.uPixelRatio.value, height * this.uniforms.uPixelRatio.value);
    return true;
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
