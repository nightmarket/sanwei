import type { DebugContext } from "../../core/debugHelpers";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";
import { Cycles } from "./Cycles";
import { sunProgress } from "./ephemeris";
import { DAY_PRESETS, YEAR_PRESETS } from "./presets";

export type TimeProgressMode = "wallclock" | "ephemeris";

export type TimePluginOptions = {
  dayDuration?: number;
  yearDuration?: number;
  dayProgress?: number | null;
  yearProgress?: number | null;
  /** `ephemeris` uses lat/lon + date instead of a looping wall-clock day. */
  dayMode?: TimeProgressMode;
  latitude?: number;
  longitude?: number;
  getDate?: () => Date;
};

export class TimePlugin implements ISanweiPlugin {
  readonly name = "time";
  day!: Cycles;
  year!: Cycles;

  private app: SanweiApp | null = null;
  private unsub: (() => void) | null = null;
  private options: TimePluginOptions;

  constructor(options: TimePluginOptions = {}) {
    this.options = options;
  }

  install(app: SanweiApp) {
    this.app = app;
    const { dayDuration = 4 * 60, yearDuration = 60 * 60 * 24 * 365 } = this.options;

    this.day = new Cycles({
      name: "day",
      duration: dayDuration,
      forcedProgress: this.options.dayProgress ?? null,
      progressSource:
        this.options.dayMode === "ephemeris"
          ? () =>
              sunProgress(
                this.options.latitude ?? 48.86,
                this.options.longitude ?? 2.35,
                this.options.getDate?.() ?? new Date()
              )
          : undefined,
    });
    this.day.setKeyframes([
      { properties: DAY_PRESETS.day, stop: 0.0 },
      { properties: DAY_PRESETS.day, stop: 0.15 },
      { properties: DAY_PRESETS.dusk, stop: 0.25 },
      { properties: DAY_PRESETS.night, stop: 0.35 },
      { properties: DAY_PRESETS.night, stop: 0.6 },
      { properties: DAY_PRESETS.dawn, stop: 0.8 },
      { properties: DAY_PRESETS.day, stop: 0.9 },
    ]);
    this.day.addIntervalEvent("night", 0.25, 0.7);
    this.day.addIntervalEvent("deepNight", 0.35, 0.6);

    this.year = new Cycles({
      name: "year",
      duration: yearDuration,
      forcedProgress: this.options.yearProgress ?? null,
    });
    this.year.setKeyframes([
      { properties: YEAR_PRESETS.winter, stop: 0.125 },
      { properties: YEAR_PRESETS.spring, stop: 0.375 },
      { properties: YEAR_PRESETS.summer, stop: 0.625 },
      { properties: YEAR_PRESETS.fall, stop: 0.875 },
    ]);

    this.unsub = app.ticker.on((ticker) => {
      this.day.update(ticker);
      this.year.update(ticker);
    }, TICK_ORDER.TIME);
    this.day.update(app.ticker, true);
    this.year.update(app.ticker, true);
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "Time", expanded: false });
    folder.addBinding(this.day, "progress", { min: 0, max: 1, step: 0.001, readonly: true });
    folder.addBinding(this.year, "progress", { min: 0, max: 1, step: 0.001, readonly: true });
    folder.addBinding(this.day, "duration", { min: 1, max: 600, step: 1, label: "dayDuration" });
  }

  dispose() {
    this.unsub?.();
    this.unsub = null;
    this.app = null;
  }
}
