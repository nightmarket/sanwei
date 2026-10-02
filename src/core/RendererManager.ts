import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  BasicShadowMap,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  PCFShadowMap,
  ReinhardToneMapping,
} from "three";
import { isDebugEnabled, SHADOW_MAP_TYPES, TONE_MAPPING_TYPES } from "./constants";
import type { DebugContext } from "./debugHelpers";
import type { AppUniformsShape } from "./globalUniformsAdapter";

const TONE_MAPPINGS: Record<string, number> = {
  [TONE_MAPPING_TYPES.None]: NoToneMapping,
  [TONE_MAPPING_TYPES.Linear]: LinearToneMapping,
  [TONE_MAPPING_TYPES.Reinhard]: ReinhardToneMapping,
  [TONE_MAPPING_TYPES.Cineon]: CineonToneMapping,
  [TONE_MAPPING_TYPES.ACESFilmic]: ACESFilmicToneMapping,
  [TONE_MAPPING_TYPES.AgX]: AgXToneMapping,
  [TONE_MAPPING_TYPES.Neutral]: NeutralToneMapping,
};

const SHADOW_MAPS: Record<string, number> = {
  [SHADOW_MAP_TYPES.Basic]: BasicShadowMap,
  [SHADOW_MAP_TYPES.PCF]: PCFShadowMap,
  // r186 made PCFShadowMap the soft filter; PCFSoftShadowMap is gone on WebGPU.
  [SHADOW_MAP_TYPES.PCFSoft]: PCFShadowMap,
};

const optionsFor = (types: Record<string, string>) =>
  Object.fromEntries(Object.values(types).map((type) => [type, type]));

const DEFAULT_SETTINGS = {
  toneMappingExposure: 0.3,
  toneMapping: TONE_MAPPING_TYPES.ACESFilmic,
  shadowMapType: SHADOW_MAP_TYPES.PCFSoft,
  shadowMapEnabled: true,
};

export type RendererSettings = typeof DEFAULT_SETTINGS;

/** Per-app renderer wrapper: owns the canvas/renderer pair, sizing, and renderer debug bindings. */
export class RendererManager {
  canvas: HTMLCanvasElement | null = null;
  renderer: any = null;

  private settings: RendererSettings;

  constructor(
    private uniforms: AppUniformsShape,
    private name = "",
    settings: Partial<RendererSettings> = {}
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  init({ canvas, renderer }: { canvas: HTMLCanvasElement; renderer: any }) {
    this.canvas = canvas;
    this.renderer = renderer;

    this.resize();

    if (isDebugEnabled()) {
      this.renderer.debug.checkShaderErrors = true;
      this.renderer.debug.onShaderError = (gl: any, program: any, vs: any, fs: any) =>
        console.error(gl, program, vs, fs);
    }

    this.renderer.toneMapping = TONE_MAPPINGS[this.settings.toneMapping];
    this.renderer.toneMappingExposure = this.settings.toneMappingExposure;
    this.renderer.shadowMap.type = SHADOW_MAPS[this.settings.shadowMapType];
    this.renderer.shadowMap.enabled = this.settings.shadowMapEnabled;
  }

  async initDebug({ debug, inspectorPane }: DebugContext) {
    if (!inspectorPane) return;

    const folder = inspectorPane.addFolder({
      title: "Renderer",
      expanded: false,
    });
    debug.register(this.name ? `RendererManager:${this.name}` : "RendererManager", folder);

    folder
      .addBinding(this.settings, "toneMappingExposure", {
        label: "Tone Mapping Exposure",
        min: 0,
        max: 1,
        step: 0.01,
      })
      .on("change", (ev: any) => {
        this.renderer.toneMappingExposure = ev.value;
      });

    folder
      .addBinding(this.settings, "toneMapping", {
        label: "Tone Mapping",
        options: optionsFor(TONE_MAPPING_TYPES),
      })
      .on("change", (ev: any) => {
        this.renderer.toneMapping = TONE_MAPPINGS[ev.value];
      });

    folder
      .addBinding(this.settings, "shadowMapType", {
        label: "Shadow Map Type",
        options: optionsFor(SHADOW_MAP_TYPES),
        showIf: () => this.settings.shadowMapEnabled,
      })
      .on("change", (ev: any) => {
        this.renderer.shadowMap.type = SHADOW_MAPS[ev.value];
        this.renderer.shadowMap.needsUpdate = true;
      });

    folder
      .addBinding(this.settings, "shadowMapEnabled", {
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

    const pixelRatio = this.uniforms.uPixelRatio.value;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.uniforms.uScreen.value.set(width * pixelRatio, height * pixelRatio);
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
