/**
 * Debug tooling is development-only by design.
 *
 * Bundlers replace `process.env.NODE_ENV` at build time, allowing debug-only
 * branches and dynamic imports to be removed from production builds.
 */
export const IS_DEBUG = process.env.NODE_ENV !== "production";
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
