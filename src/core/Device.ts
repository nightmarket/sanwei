import { getGPUTier } from "detect-gpu";
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

const DEFAULT_QUALITY: QualityPreset = {
  dpr: 1,
  postScale: 0.5,
  antialias: false,
  effects: true,
};

function clampTier(tier: number): GpuTier {
  if (tier === 0 || tier === 1 || tier === 2 || tier === 3) return tier;
  return 1;
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

  gpuInfo: any;
  isMobile = false;
  tier: GpuTier = 1;
  quality: QualityPreset = { ...DEFAULT_QUALITY };
  /** Device-wide pixel-ratio policy. Each SanweiApp seeds its `uPixelRatio` uniform from this. */
  pixelRatio = 1;
  private ready: Promise<void> | null = null;

  async init() {
    if (!this.ready) {
      this.ready = this.detect();
    }
    return this.ready;
  }

  private async detect() {
    this.gpuInfo = await getGPUTier();
    this.isMobile = isTouchDevice();
    this.tier = clampTier(this.gpuInfo?.tier ?? 1);
    this.quality = qualityFor(this.tier, this.isMobile);
    this.pixelRatio = this.quality.dpr;
  }

  destroy() {
    this.gpuInfo = null;
    this.isMobile = false;
    this.tier = 1;
    this.quality = { ...DEFAULT_QUALITY };
    this.pixelRatio = 1;
    this.ready = null;
  }
}

export const Device = new DeviceClass();
