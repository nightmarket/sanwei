export const IS_DEBUG = process.env.NEXT_PUBLIC_IS_DEBUG === "true";
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
