import { DisplayP3ColorSpace, LinearDisplayP3ColorSpace } from "three/addons/math/ColorSpaces.js";
import { ColorManagement, WebGPURenderer } from "three/webgpu";
import { Device } from "../core/Device";

export type CreateWebGPURendererOptions = {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  alpha?: boolean;
  forceWebGL?: boolean;
};

let sharedDevice: Promise<GPUDevice | null> | null = null;

/** `WebGPURenderer` copies images in as sRGB, which a P3 working space then reads as P3
 * (oversaturated). Only sRGB-transfer textures hold color; data textures upload untouched. */
function uploadImagesAsDisplayP3(queue: GPUQueue) {
  const copy = queue.copyExternalImageToTexture.bind(queue);
  queue.copyExternalImageToTexture = (source, destination, size) =>
    copy(
      source,
      destination.texture.format.endsWith("-srgb") ? { ...destination, colorSpace: DisplayP3ColorSpace } : destination,
      size
    );
}

let outputColorSpace: PredefinedColorSpace = DisplayP3ColorSpace;
const taggedOutputs = new Map<HTMLCanvasElement, (space: PredefinedColorSpace) => void>();

/** `WebGPURenderer` leaves the canvas at sRGB, which shows P3 output washed out, and WebGL uploads
 * images as sRGB. The WebGPU context is configured lazily on the first render, so `configure` is
 * wrapped rather than called. Returns how to retag the canvas, or null where it can't be tagged. */
function tagCanvasColorSpace(
  canvas: HTMLCanvasElement,
  webgpu: boolean
): ((space: PredefinedColorSpace) => void) | null {
  if (webgpu) {
    const context = canvas.getContext("webgpu");
    if (!context) return null;
    const configure = context.configure.bind(context);
    context.configure = (configuration) => configure({ ...configuration, colorSpace: outputColorSpace });
    return () => {
      const configuration = context.getConfiguration();
      if (configuration) context.configure(configuration);
    };
  }
  const gl = canvas.getContext("webgl2");
  if (!gl) return null;
  if ("unpackColorSpace" in gl) gl.unpackColorSpace = DisplayP3ColorSpace;
  else console.warn("sanwei: WebGL2 can't upload images as Display P3; they will look oversaturated");
  if (!("drawingBufferColorSpace" in gl)) return null;
  return (space: PredefinedColorSpace) => {
    gl.drawingBufferColorSpace = space;
  };
}

/** Switches every P3-tagged canvas between P3 and sRGB output, e.g. to preview an sRGB screen from
 * a P3 one. The working space stays P3; sRGB output clips to the sRGB gamut like such a screen. */
export function setOutputColorSpace(space: PredefinedColorSpace) {
  outputColorSpace = space;
  for (const apply of taggedOutputs.values()) apply(space);
}

function requestSharedDevice(): Promise<GPUDevice | null> {
  sharedDevice ??= (async () => {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      if (ColorManagement.workingColorSpace === LinearDisplayP3ColorSpace) uploadImagesAsDisplayP3(device.queue);
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
 * detection and the device request run in parallel. Outputs Display P3 when
 * the app opted in (`@nightmarket/sanwei/display-p3`) and the canvas supports it.
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
  const retag =
    ColorManagement.workingColorSpace === LinearDisplayP3ColorSpace && tagCanvasColorSpace(canvas, Boolean(device));
  if (retag) {
    const apply = (space: PredefinedColorSpace) => {
      retag(space);
      renderer.outputColorSpace = space;
    };
    apply(outputColorSpace);
    taggedOutputs.set(canvas, apply);
  }
  return renderer;
}
