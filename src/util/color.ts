import { type Color, ColorManagement } from "three";
import {
  DisplayP3ColorSpace,
  DisplayP3ColorSpaceImpl,
  LinearDisplayP3ColorSpace,
  LinearDisplayP3ColorSpaceImpl,
} from "three/addons/math/ColorSpaces.js";

ColorManagement.define({
  [DisplayP3ColorSpace]: DisplayP3ColorSpaceImpl,
  [LinearDisplayP3ColorSpace]: LinearDisplayP3ColorSpaceImpl,
});

const DISPLAY_P3_STYLE = /^color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

/** `Color.set` for CSS color strings, plus `color(display-p3 r g b)`, which `three` doesn't parse. */
export function setCssColor(color: Color, style: string) {
  const p3 = DISPLAY_P3_STYLE.exec(style);
  return p3 ? color.setRGB(Number(p3[1]), Number(p3[2]), Number(p3[3]), DisplayP3ColorSpace) : color.set(style);
}
