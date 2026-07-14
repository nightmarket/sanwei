import { getGPUTier } from "detect-gpu";
import { isTouchDevice } from "../util/responsive";
import { GlobalUniforms } from "./globalUniformsAdapter";

class DeviceClass {
  isSingleton = true;

  gpuInfo: any;
  isMobile = false;

  async init() {
    this.gpuInfo = await getGPUTier();
    this.isMobile = isTouchDevice();

    // Cap at 2: >2x DPR quadruples fragment cost for no perceptible gain at these screen sizes.
    GlobalUniforms.uPixelRatio.value = this.isMobile ? 1 : Math.min(window.devicePixelRatio, 2);
  }

  destroy() {
    this.gpuInfo = null;
    this.isMobile = false;
  }
}

export const Device = new DeviceClass();
