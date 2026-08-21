/**
 * Debug gating follows tiao's debug level: the `DEBUG_LEVEL` env variable
 * (read through the bundler's prefix, e.g. `NEXT_PUBLIC_DEBUG_LEVEL`) plus the
 * `?debug` URL param. Runtime check — evaluate at the moment of gating, not at
 * module scope.
 */
export { isTiaoEnabled as isDebugEnabled } from "@nightmarket/tiao";
export const NO_RAYCAST_CLASS = "no-raycast";

export const TONE_MAPPING_TYPES = {
  None: "None",
  Linear: "Linear",
  Reinhard: "Reinhard",
  Cineon: "Cineon",
  ACESFilmic: "ACESFilmic",
  AgX: "AgX",
  Neutral: "Neutral",
};

export const SHADOW_MAP_TYPES = {
  Basic: "Basic",
  PCF: "PCF",
  PCFSoft: "PCFSoft",
};

export const PassType = {
  RENDER: "render",
  TRANSITION: "transition",

  RADIAL_BLUR: "radialBlur",
  COMPOSITE: "composite",
  BLOOM: "bloom",
  DITHER: "dither",
  KUWAHARA: "kuwahara",

  GTAO: "gtao",
  LUT: "lut",
  SMAA: "smaa",

  AFTER_IMAGE: "afterImage",
  ASCII: "ascii",
  DOF: "dof",
};
