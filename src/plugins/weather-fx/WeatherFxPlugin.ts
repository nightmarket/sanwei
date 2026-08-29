import type { DebugContext } from "../../core/debugHelpers";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";
import { type SceneTarget, whenSceneReady } from "../shared/scene";
import { TimePlugin } from "../time/TimePlugin";
import { WeatherPlugin } from "../weather/WeatherPlugin";
import { Lightnings, type LightningsOptions } from "./Lightnings";
import { RainLines, type RainLinesOptions } from "./RainLines";
import { Snow, type SnowOptions } from "./Snow";
import { WindLines, type WindLinesOptions } from "./WindLines";

export type WeatherFxPluginOptions = SceneTarget & {
  rain?: boolean | RainLinesOptions;
  snow?: boolean | SnowOptions;
  windLines?: boolean | WindLinesOptions;
  lightnings?: boolean | LightningsOptions;
};

export class WeatherFxPlugin implements ISanweiPlugin {
  readonly name = "weather-fx";
  readonly dependencies = ["weather", "time"];

  rain: RainLines | null = null;
  snow: Snow | null = null;
  windLines: WindLines | null = null;
  lightnings: Lightnings | null = null;

  private unsubs: Array<() => void> = [];

  constructor(private options: WeatherFxPluginOptions = {}) {}

  install(app: SanweiApp) {
    const weather = app.plugin(WeatherPlugin);
    const time = app.plugin(TimePlugin);
    const enabled = (value: boolean | object | undefined, fallback: boolean) =>
      value === undefined ? fallback : value !== false;

    this.unsubs.push(
      whenSceneReady(app, this.options, (scene) => {
        if (enabled(this.options.rain, true)) {
          this.rain = new RainLines(
            scene,
            weather,
            typeof this.options.rain === "object" ? this.options.rain : {}
          );
        }
        if (enabled(this.options.snow, true)) {
          this.snow = new Snow(
            scene,
            weather,
            time,
            typeof this.options.snow === "object" ? this.options.snow : {}
          );
        }
        if (enabled(this.options.windLines, true)) {
          this.windLines = new WindLines(
            scene,
            weather,
            typeof this.options.windLines === "object" ? this.options.windLines : {}
          );
        }
        if (enabled(this.options.lightnings, true)) {
          this.lightnings = new Lightnings(
            scene,
            weather,
            typeof this.options.lightnings === "object" ? this.options.lightnings : {}
          );
        }
      })
    );

    this.unsubs.push(
      app.ticker.on((ticker) => {
        this.rain?.update(ticker.deltaScaled);
        this.snow?.update();
        this.windLines?.update(ticker.deltaScaled);
        this.lightnings?.update(ticker.deltaScaled);
      }, TICK_ORDER.WORLD)
    );
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "Weather FX", expanded: false });
    if (this.rain) folder.addBinding(this.rain, "speed", { min: 0, max: 1, step: 0.001 });
    if (this.lightnings) {
      folder.addBinding(this.lightnings, "frequency", { min: 0.1, max: 10, step: 0.1 });
      folder.addButton({ title: "Strike" }).on("click", () => this.lightnings?.strike());
    }
  }

  dispose() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.rain?.dispose();
    this.snow?.dispose();
    this.windLines?.dispose();
    this.lightnings?.dispose();
  }
}
