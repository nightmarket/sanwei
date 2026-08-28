import { Device } from "../core/Device";
import * as THREE from "three/webgpu";

export type CreateWebGPURendererOptions = {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  alpha?: boolean;
  forceWebGL?: boolean;
};

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<{ requestDevice: () => Promise<GPUDevice> } | null>;
  };
};

let sharedDevice: Promise<GPUDevice | null> | null = null;

function requestSharedDevice(): Promise<GPUDevice | null> {
  if (!sharedDevice) {
    sharedDevice = (async () => {
      const gpu = (navigator as GpuNavigator).gpu;
      if (!gpu) return null;
      try {
        const adapter = await gpu.requestAdapter();
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
  }
  return sharedDevice;
}

async function createFallbackRenderer(options: CreateWebGPURendererOptions) {
  const renderer = new THREE.WebGPURenderer({
    canvas: options.canvas,
    antialias: options.antialias,
    alpha: options.alpha,
    forceWebGL: true,
  });
  await renderer.init();
  return renderer;
}

export function hasGpuRendererSupport() {
  if (typeof navigator === "undefined") return false;
  if ((navigator as GpuNavigator).gpu) return true;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

/** One WebGPURenderer per canvas, sharing a single GPUDevice when WebGPU is available. */
export async function createWebGPURenderer(options: CreateWebGPURendererOptions) {
  await Device.init();
  const resolved: CreateWebGPURendererOptions = {
    ...options,
    antialias: options.antialias ?? Device.quality.antialias,
  };

  const forceWebGL =
    resolved.forceWebGL ||
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("forceWebGL")) ||
    !(navigator as GpuNavigator).gpu;

  if (forceWebGL) {
    return createFallbackRenderer({ ...resolved, forceWebGL: true });
  }

  const device = await requestSharedDevice();
  if (!device) return createFallbackRenderer(resolved);

  const renderer = new THREE.WebGPURenderer({
    canvas: resolved.canvas,
    antialias: resolved.antialias,
    alpha: resolved.alpha,
    device,
  });
  await renderer.init();
  return renderer;
}
