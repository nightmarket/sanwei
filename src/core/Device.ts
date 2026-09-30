import { getGPUTier, type TierResult } from "detect-gpu";
import { isTouchDevice } from "../util/responsive";

export type GpuTier = 0 | 1 | 2 | 3;

export type QualityPreset = {
  /** Device pixel ratio actually applied. */
  dpr: number;
  /** Post-effect RT scale vs full-res (e.g. 0.5). */
  postScale: number;
  antialias: boolean;
  effects: boolean;
};

const DEFAULT_TIER: GpuTier = 1;

/** detect-gpu fetches its benchmark table from a CDN; past this, fall back to the default tier. */
const DETECT_TIMEOUT_MS = 2000;

function clampTier(tier: number | undefined): GpuTier {
  if (tier === 0 || tier === 1 || tier === 2 || tier === 3) return tier;
  return DEFAULT_TIER;
}

function qualityFor(tier: GpuTier, isMobile: boolean): QualityPreset {
  const dprCap = Math.min(window.devicePixelRatio || 1, 2);
  switch (tier) {
    case 0:
      return { dpr: 1, postScale: 0.25, antialias: false, effects: false };
    case 1:
      return { dpr: 1, postScale: 0.5, antialias: false, effects: !isMobile };
    case 2:
    case 3:
      return { dpr: isMobile ? 1 : dprCap, postScale: 0.5, antialias: true, effects: true };
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unhandled GPU tier: ${_exhaustive}`);
    }
  }
}

class DeviceClass {
  isSingleton = true;

  gpuInfo: TierResult | null = null;
  isMobile = false;
  tier: GpuTier = DEFAULT_TIER;
  quality: QualityPreset = { dpr: 1, postScale: 0.5, antialias: false, effects: true };
  /** Device-wide pixel-ratio policy. Each SanweiApp seeds its `uPixelRatio` uniform from this. */
  pixelRatio = 1;
  private ready: Promise<void> | null = null;

  init() {
    this.ready ??= this.detect();
    return this.ready;
  }

  private async detect() {
    this.isMobile = isTouchDevice();
    this.gpuInfo = await Promise.race([
      getGPUTier(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DETECT_TIMEOUT_MS)),
    ]);
    this.tier = clampTier(this.gpuInfo?.tier);
    this.quality = qualityFor(this.tier, this.isMobile);
    this.pixelRatio = this.quality.dpr;
  }
}

export const Device = new DeviceClass();
