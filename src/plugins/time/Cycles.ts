import { Color } from "three";
import type { Ticker } from "../../core/Ticker";
import { lerp, smoothstep } from "../shared/math";
import { StrengthTween } from "../shared/tween";

export type CyclePropertyType = "number" | "color";

export type CycleProperty = {
  value: number | Color;
  overrideValue: number | Color | null;
  type: CyclePropertyType;
};

export type CycleKeyframeStep = {
  properties: Record<string, number | Color>;
  stop: number;
};

export type IntervalEvent = {
  name: string;
  startProgress: number;
  endProgress: number;
  inInterval: boolean;
};

export type CycleEventMap = {
  [name: string]: (active?: boolean) => void;
};

export type CyclesOptions = {
  name?: string;
  duration: number;
  forcedProgress?: number | null;
  progressSource?: () => number;
};

export class Cycles {
  name: string;
  duration: number;
  absoluteProgress: number;
  progress = 0;
  progressDelta = 0;
  properties: Record<string, CycleProperty> = {};
  events = new Map<string, Set<(active?: boolean) => void>>();

  readonly overrideTween = new StrengthTween();
  readonly override: {
    strength: number;
    progress: number | null;
    start: (values?: Record<string, number | Color | undefined> & { progress?: number }, duration?: number) => void;
    end: (duration?: number) => void;
  };

  private forcedProgress: number | null;
  private progressSource?: () => number;
  private keyframes: CycleKeyframeStep[][] = [];
  private punctualEvents = new Map<string, { name: string; progress: number }>();
  private intervalEvents = new Map<string, IntervalEvent>();
  private overrideValues: Record<string, number | Color | undefined> = {};
  private overrideProgress: number | null = null;

  constructor(options: CyclesOptions) {
    this.name = options.name ?? "Cycles";
    this.duration = options.duration;
    this.forcedProgress = options.forcedProgress ?? null;
    this.progressSource = options.progressSource;
    this.absoluteProgress = this.readAbsoluteProgress();

    this.override = {
      get strength() {
        return 0;
      },
      progress: null,
      start: (values = {}, duration = 5) => {
        this.overrideValues = { ...values };
        this.overrideProgress = typeof values.progress === "number" ? values.progress : null;
        this.override.progress = this.overrideProgress;
        this.overrideTween.start(1, duration);
      },
      end: (duration = 5) => {
        this.overrideTween.start(0, duration);
      },
    };
    Object.defineProperty(this.override, "strength", {
      get: () => this.overrideTween.strength,
    });
  }

  on(name: string, callback: (active?: boolean) => void) {
    let set = this.events.get(name);
    if (!set) {
      set = new Set();
      this.events.set(name, set);
    }
    set.add(callback);
    return () => set!.delete(callback);
  }

  protected emit(name: string, active?: boolean) {
    this.events.get(name)?.forEach((callback) => callback(active));
  }

  setKeyframes(steps: CycleKeyframeStep[]) {
    const cloned = steps.map((step) => ({
      stop: step.stop,
      properties: { ...step.properties },
    }));

    for (const key of Object.keys(cloned[0]!.properties)) {
      const raw = cloned[0]!.properties[key]!;
      if (raw instanceof Color) {
        this.properties[key] = { type: "color", value: raw.clone(), overrideValue: null };
      } else {
        this.properties[key] = { type: "number", value: raw, overrideValue: null };
      }
    }

    const first = cloned[0]!;
    const last = cloned[cloned.length - 1]!;
    if (last.stop < 1) {
      cloned.push({ ...first, properties: { ...first.properties }, stop: 1 + first.stop });
    }
    if (first.stop > 0) {
      cloned.unshift({ ...last, properties: { ...last.properties }, stop: -(1 - last.stop) });
    }

    this.keyframes.push(cloned);
  }

  addPunctualEvent(name: string, progress: number) {
    this.punctualEvents.set(name, { name, progress });
  }

  addIntervalEvent(name: string, startProgress: number, endProgress: number) {
    this.intervalEvents.set(name, { name, startProgress, endProgress, inInterval: false });
  }

  update(ticker: Ticker, firstFrame = false) {
    this.overrideTween.update(ticker.delta);
    const nextAbsolute = this.readAbsoluteProgress();
    this.progressDelta = nextAbsolute - this.absoluteProgress;
    this.absoluteProgress = nextAbsolute;
    const newProgress = ((nextAbsolute % 1) + 1) % 1;

    this.punctualEvents.forEach((event) => {
      if (newProgress >= event.progress && this.progress < event.progress) {
        const fire = () => this.emit(event.name);
        if (firstFrame) ticker.wait(1, fire);
        else fire();
      }
    });

    this.intervalEvents.forEach((event) => {
      const inInterval = newProgress > event.startProgress && newProgress < event.endProgress;
      if (inInterval !== event.inInterval) {
        event.inInterval = inInterval;
        const fire = () => this.emit(event.name, inInterval);
        if (firstFrame) ticker.wait(1, fire);
        else fire();
      }
    });

    this.progress = newProgress;
    if (this.overrideTween.strength > 0 && this.overrideProgress !== null) {
      this.progress = lerp(this.progress, this.overrideProgress, this.overrideTween.strength);
    }

    for (const steps of this.keyframes) {
      let indexPrev = -1;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i]!.stop <= this.progress) indexPrev = i;
      }
      const indexNext = (indexPrev + 1) % steps.length;
      const previous = steps[indexPrev]!;
      const next = steps[indexNext]!;
      const mixRatio = smoothstep(this.progress, previous.stop, next.stop);

      for (const key of Object.keys(this.properties)) {
        const property = this.properties[key]!;
        if (property.type === "color") {
          (property.value as Color).lerpColors(
            previous.properties[key] as Color,
            next.properties[key] as Color,
            mixRatio
          );
        } else {
          property.value = lerp(
            previous.properties[key] as number,
            next.properties[key] as number,
            mixRatio
          );
        }

        const overrideValue = this.overrideValues[key];
        if (this.overrideTween.strength > 0 && overrideValue !== undefined) {
          if (property.type === "color") {
            (property.value as Color).lerp(overrideValue as Color, this.overrideTween.strength);
          } else {
            property.value = lerp(
              property.value as number,
              overrideValue as number,
              this.overrideTween.strength
            );
          }
        }
      }
    }
  }

  number(key: string): number {
    return this.properties[key]?.value as number;
  }

  color(key: string): Color {
    return this.properties[key]?.value as Color;
  }

  private readAbsoluteProgress() {
    if (this.forcedProgress !== null) return this.forcedProgress;
    if (this.progressSource) return this.progressSource();
    return Date.now() / 1000 / this.duration;
  }
}
