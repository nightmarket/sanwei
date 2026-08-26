import { getGPUTier } from "detect-gpu";
import { isTouchDevice } from "../util/responsive";

class DeviceClass {
  isSingleton = true;

  gpuInfo: any;
  isMobile = false;
  /** Device-wide pixel-ratio policy. Each SanweiApp seeds its `uPixelRatio` uniform from this. */
  pixelRatio = 1;

  async init() {
    this.gpuInfo = await getGPUTier();
    this.isMobile = isTouchDevice();

    // Cap at 2: >2x DPR quadruples fragment cost for no perceptible gain at these screen sizes.
    this.pixelRatio = this.isMobile ? 1 : Math.min(window.devicePixelRatio, 2);
  }

  destroy() {
    this.gpuInfo = null;
    this.isMobile = false;
    this.pixelRatio = 1;
  }
}

export const Device = new DeviceClass();
