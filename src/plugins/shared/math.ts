export function clamp(input: number, min: number, max: number) {
  return Math.max(min, Math.min(input, max));
}

export function lerp(start: number, end: number, ratio: number) {
  return (1 - ratio) * start + ratio * end;
}

export function remap(input: number, inLow: number, inHigh: number, outLow: number, outHigh: number) {
  return ((input - inLow) * (outHigh - outLow)) / (inHigh - inLow) + outLow;
}

export function remapClamp(input: number, inLow: number, inHigh: number, outLow: number, outHigh: number) {
  const mapped = remap(input, inLow, inHigh, outLow, outHigh);
  return outLow < outHigh ? clamp(mapped, outLow, outHigh) : clamp(mapped, outHigh, outLow);
}

export function smoothstep(value: number, min: number, max: number) {
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}
