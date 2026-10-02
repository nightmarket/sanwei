// Opt-in, side-effect entry: `import "@nightmarket/sanwei/display-p3"` makes linear Display P3 the
// working color space, so colors and shader literals can reach past sRGB, and `createWebGPURenderer`
// tags its canvas P3 wherever the browser can (sRGB output otherwise). A `Color` converts into the
// working space when it's set, so this must be imported before anything creates one.
//
// sRGB images only upload as P3 through WebGPU or WebGL2's `unpackColorSpace` (missing in Safari);
// anywhere else they would read oversaturated, so the working space stays sRGB there.

import { ColorManagement } from "three";
import { LinearDisplayP3ColorSpace } from "three/addons/math/ColorSpaces.js";
import "../util/color";

const uploadsDisplayP3 =
  typeof navigator !== "undefined" &&
  ("gpu" in navigator ||
    (typeof WebGL2RenderingContext !== "undefined" && "unpackColorSpace" in WebGL2RenderingContext.prototype));

if (uploadsDisplayP3) ColorManagement.workingColorSpace = LinearDisplayP3ColorSpace;
