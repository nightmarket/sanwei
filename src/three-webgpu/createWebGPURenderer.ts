import { WebGPURenderer } from "three/webgpu";
import { Device } from "../core/Device";

export type CreateWebGPURendererOptions = {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  alpha?: boolean;
  forceWebGL?: boolean;
};

let sharedDevice: Promise<GPUDevice | null> | null = null;

function requestSharedDevice(): Promise<GPUDevice | null> {
  sharedDevice ??= (async () => {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      device.lost.then((info) => {
        console.warn("sanwei: GPU device lost", info.reason, info.message);
        sharedDevice = null;
      });
      return device;
    } catch (error) {
      console.warn("sanwei: failed to request GPU device", error);
      return null;
    }
  })();
  return sharedDevice;
}

export function hasGpuRendererSupport() {
  if (typeof navigator === "undefined") return false;
  if (navigator.gpu) return true;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * One WebGPURenderer per canvas, sharing a single GPUDevice when WebGPU is
 * available and falling back to the WebGL2 backend otherwise. GPU tier
 * detection and the device request run in parallel.
 */
export async function createWebGPURenderer({ canvas, antialias, alpha, forceWebGL }: CreateWebGPURendererOptions) {
  const useWebGL = forceWebGL || new URLSearchParams(window.location.search).has("forceWebGL") || !navigator.gpu;
  const [device] = await Promise.all([useWebGL ? null : requestSharedDevice(), Device.init()]);

  const renderer = new WebGPURenderer({
    canvas,
    antialias: antialias ?? Device.quality.antialias,
    alpha,
    ...(device ? { device } : { forceWebGL: true }),
  });
  await renderer.init();
  return renderer;
}
