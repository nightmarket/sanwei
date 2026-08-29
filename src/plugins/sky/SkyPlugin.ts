import { color, mix, rangeFogFactor, uniform, vec2, viewportUV } from "three/tsl";
import type { DebugContext } from "../../core/debugHelpers";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";
import { type SceneTarget, whenSceneReady } from "../shared/scene";
import { TimePlugin } from "../time/TimePlugin";

export type SkyPluginOptions = SceneTarget & {
  fogNear?: number;
  fogFar?: number;
};

export class SkyPlugin implements ISanweiPlugin {
  readonly name = "sky";
  readonly dependencies = ["time"];

  colorA: any;
  colorB: any;
  color: any;
  near: any;
  far: any;
  strength: any;
  radialCenter: any;
  radialStart: any;
  radialEnd: any;

  fogNear: number;
  fogFar: number;

  private app: SanweiApp | null = null;
  private time: TimePlugin | null = null;
  private scene: any = null;
  private unsubs: Array<() => void> = [];

  constructor(private options: SkyPluginOptions = {}) {
    this.fogNear = options.fogNear ?? 8;
    this.fogFar = options.fogFar ?? 40;
  }

  install(app: SanweiApp) {
    this.app = app;
    this.time = app.plugin(TimePlugin);

    this.colorA = uniform(color("#00ffff"));
    this.colorB = uniform(color("#9b89ff"));
    this.radialCenter = uniform(vec2(0, 0));
    this.radialStart = uniform(0);
    this.radialEnd = uniform(1);
    this.near = uniform(this.fogNear);
    this.far = uniform(this.fogFar);

    const colorMix = vec2(viewportUV.xy)
      .sub(this.radialCenter)
      .length()
      .smoothstep(this.radialStart, this.radialEnd);
    this.color = mix(this.colorA, this.colorB, colorMix);
    this.strength = rangeFogFactor(this.near, this.far);

    this.unsubs.push(
      whenSceneReady(app, this.options, (scene) => {
        this.scene = scene;
        scene.backgroundNode = this.color;
      })
    );

    this.unsubs.push(
      app.ticker.on(() => {
        if (!this.time) return;
        const amplitude = this.fogFar - this.fogNear;
        this.colorA.value.copy(this.time.day.color("fogColorA"));
        this.colorB.value.copy(this.time.day.color("fogColorB"));
        this.near.value = this.fogNear + this.time.day.number("fogNearRatio") * amplitude;
        this.far.value = this.fogNear + this.time.day.number("fogFarRatio") * amplitude;
      }, TICK_ORDER.WORLD)
    );
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "Sky", expanded: false });
    folder.addBinding(this, "fogNear", { min: 0, max: 200, step: 0.1 });
    folder.addBinding(this, "fogFar", { min: 0, max: 400, step: 0.1 });
  }

  dispose() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    if (this.scene) this.scene.backgroundNode = null;
    this.app = null;
    this.time = null;
  }
}
