import type { DebugContext } from "../../core/debugHelpers";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";
import { lerp, remapClamp } from "../shared/math";
import { StrengthTween } from "../shared/tween";
import { TimePlugin } from "../time/TimePlugin";

export type WeatherProperty = {
  name: string;
  min: number;
  max: number;
  value: number;
  overrideValue: number | null;
};

export class WeatherPlugin implements ISanweiPlugin {
  readonly name = "weather";
  readonly dependencies = ["time"];

  temperature!: WeatherProperty;
  humidity!: WeatherProperty;
  electricField!: WeatherProperty;
  clouds!: WeatherProperty;
  wind!: WeatherProperty;
  rain!: WeatherProperty;
  snow!: WeatherProperty;

  readonly properties: WeatherProperty[] = [];
  readonly overrideTween = new StrengthTween();
  readonly override = {
    start: (values: Partial<Record<string, number>> = {}, duration = 5) => {
      for (const property of this.properties) {
        property.overrideValue = values[property.name] ?? null;
      }
      this.overrideTween.start(1, duration);
    },
    end: (duration = 5) => {
      this.overrideTween.start(0, duration);
    },
    get strength() {
      return 0;
    },
  };

  private time: TimePlugin | null = null;
  private unsub: (() => void) | null = null;

  constructor() {
    Object.defineProperty(this.override, "strength", {
      get: () => this.overrideTween.strength,
    });
  }

  install(app: SanweiApp) {
    this.time = app.plugin(TimePlugin);

    this.temperature = this.addProperty("temperature", -15, 40, () => {
      const yearValue = this.time!.year.number("temperature");
      const dayValue = this.time!.day.number("temperature");
      const variation = this.noise(this.time!.day.absoluteProgress * 0.4) * 7.5;
      return yearValue + dayValue + variation;
    });

    this.humidity = this.addProperty("humidity", 0, 1, () => {
      const yearValue = this.time!.year.number("humidity");
      return yearValue + this.noise(this.time!.day.absoluteProgress * 0.36) * 0.2;
    });

    this.electricField = this.addProperty("electricField", -1, 1, () => {
      const dayValue = this.time!.day.number("electricField");
      return dayValue * this.noise(this.time!.day.absoluteProgress * 0.53);
    });

    this.clouds = this.addProperty("clouds", -1, 1, () => {
      return this.noise(this.time!.day.absoluteProgress * 0.44);
    });

    this.wind = this.addProperty("wind", 0, 1, () => {
      return this.noise(this.time!.day.absoluteProgress) * 0.5 + 0.5;
    });

    this.rain = this.addProperty("rain", 0, 1, () => {
      return remapClamp(this.humidity.value, 0.65, 1, 0, 1) * remapClamp(this.clouds.value, 0, 1, 0, 1);
    });

    this.snow = this.addProperty("snow", -1, 1, () => {
      const rainRatio = remapClamp(this.rain.value, 0.05, 0.3, 0, 1);
      const freezeRatio = remapClamp(this.temperature.value, 0, -5, 0, 1);
      const meltRatio = remapClamp(this.temperature.value, 0, 10, 0, -1);
      return rainRatio * freezeRatio + meltRatio;
    });

    this.unsub = app.ticker.on((ticker) => {
      this.overrideTween.update(ticker.delta);
      for (const property of this.properties) {
        this.refresh(property);
      }
    }, TICK_ORDER.CYCLES);
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "Weather", expanded: false });
    for (const property of this.properties) {
      folder.addBinding(property, "value", {
        label: property.name,
        min: property.min,
        max: property.max,
        step: 0.001,
        readonly: true,
      });
    }
  }

  dispose() {
    this.unsub?.();
    this.unsub = null;
    this.time = null;
  }

  private addProperty(
    name: string,
    min: number,
    max: number,
    get: () => number
  ): WeatherProperty {
    const property: WeatherProperty & { get: () => number } = {
      name,
      min,
      max,
      value: 0,
      overrideValue: null,
      get,
    };
    this.refresh(property);
    this.properties.push(property);
    return property;
  }

  private refresh(property: WeatherProperty) {
    const getter = (property as WeatherProperty & { get: () => number }).get;
    let value = getter();
    if (this.overrideTween.strength > 0 && property.overrideValue !== null) {
      value = lerp(value, property.overrideValue, this.overrideTween.strength);
    }
    property.value = value;
  }

  private noise(x: number) {
    return Math.sin(x) * Math.sin(x * 1.678) * Math.sin(x * 2.345);
  }
}
