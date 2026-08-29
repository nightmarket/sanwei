import type { SanweiApp } from "../core/SanweiApp";
import { LightingPlugin, type LightingPluginOptions } from "./lighting/LightingPlugin";
import { SkyPlugin, type SkyPluginOptions } from "./sky/SkyPlugin";
import { TimePlugin, type TimePluginOptions } from "./time/TimePlugin";
import { WeatherPlugin } from "./weather/WeatherPlugin";
import { WeatherFxPlugin, type WeatherFxPluginOptions } from "./weather-fx/WeatherFxPlugin";
import { WindPlugin, type WindPluginOptions } from "./wind/WindPlugin";

export type EnvironmentOptions = {
  time?: TimePluginOptions;
  wind?: WindPluginOptions;
  sky?: SkyPluginOptions;
  lighting?: LightingPluginOptions;
  fx?: WeatherFxPluginOptions;
};

/** Install the folio-style environment stack: time, weather, wind, sky, lighting, weather-fx. */
export async function useEnvironment(app: SanweiApp, options: EnvironmentOptions = {}) {
  await app.use(
    new TimePlugin(options.time),
    new WeatherPlugin(),
    new WindPlugin(options.wind),
    new SkyPlugin(options.sky),
    new LightingPlugin(options.lighting),
    new WeatherFxPlugin(options.fx)
  );
  return {
    time: app.plugin(TimePlugin),
    weather: app.plugin(WeatherPlugin),
    wind: app.plugin(WindPlugin),
    sky: app.plugin(SkyPlugin),
    lighting: app.plugin(LightingPlugin),
    fx: app.plugin(WeatherFxPlugin),
  };
}
