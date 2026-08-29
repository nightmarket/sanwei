import { Fn, texture, uniform, vec2 } from "three/tsl";
import type { DebugContext } from "../../core/debugHelpers";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";
import { remapClamp } from "../shared/math";
import { createValueNoiseTexture } from "../shared/noiseTexture";
import { WeatherPlugin } from "../weather/WeatherPlugin";

export type WindPluginOptions = {
  angle?: number;
  noiseTexture?: any;
};

export class WindPlugin implements ISanweiPlugin {
  readonly name = "wind";
  readonly dependencies = ["weather"];

  angle: number;
  direction: any;
  positionFrequency: any;
  strength: any;
  localTime: any;
  timeFrequency = 0.1;
  offsetNode: any;
  noiseTexture: any;

  private weather: WeatherPlugin | null = null;
  private unsub: (() => void) | null = null;

  constructor(private options: WindPluginOptions = {}) {
    this.angle = options.angle ?? Math.PI * 0.6;
  }

  install(app: SanweiApp) {
    this.weather = app.plugin(WeatherPlugin);
    this.noiseTexture = this.options.noiseTexture ?? createValueNoiseTexture();
    this.direction = uniform(vec2(Math.sin(this.angle), Math.cos(this.angle)));
    this.positionFrequency = uniform(0.5);
    this.strength = uniform(0.5);
    this.localTime = uniform(0);

    const self = this;
    this.offsetNode = Fn(([position]: any[]) => {
      const remapped = position.mul(self.positionFrequency);
      const noiseUv1 = remapped.xy.mul(0.2).add(self.direction.mul(self.localTime)).xy;
      const noise1 = texture(self.noiseTexture, noiseUv1).r.sub(0.5);
      const noiseUv2 = remapped.xy.mul(0.1).add(self.direction.mul(self.localTime.mul(0.2))).xy;
      const noise2 = texture(self.noiseTexture, noiseUv2).r.sub(0.5);
      const intensity = noise2.add(noise1);
      return vec2(self.direction.mul(intensity).mul(self.strength));
    });

    this.unsub = app.ticker.on((ticker) => {
      this.strength.value = remapClamp(this.weather!.wind.value, 0, 1, 0.1, 1);
      this.localTime.value += ticker.deltaScaled * this.timeFrequency * this.strength.value;
    }, TICK_ORDER.WIND);
  }

  setAngle(angle: number) {
    this.angle = angle;
    this.direction.value.set(Math.sin(angle), Math.cos(angle));
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "Wind", expanded: false });
    folder.addBinding(this.strength, "value", { label: "strength", min: 0, max: 1, step: 0.001 });
    folder.addBinding(this.positionFrequency, "value", {
      label: "positionFrequency",
      min: 0,
      max: 1,
      step: 0.001,
    });
    folder.addBinding(this, "timeFrequency", { min: 0, max: 1, step: 0.001 });
    folder.addBinding(this, "angle", { min: -Math.PI, max: Math.PI, step: 0.001 }).on("change", () => {
      this.setAngle(this.angle);
    });
  }

  dispose() {
    this.unsub?.();
    this.unsub = null;
    this.weather = null;
    this.noiseTexture?.dispose?.();
  }
}
