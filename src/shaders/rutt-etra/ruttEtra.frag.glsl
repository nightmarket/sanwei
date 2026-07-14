precision highp int;
precision highp float;

uniform sampler2D tMap;
uniform float opacity;
uniform float lineOffset;
uniform float lineWidth;
uniform int lineOrientation;
uniform int mode;
varying vec2 vUv;

void main() {
  vec4 color = texture2D(tMap, vUv);
  if (mode == 1) {
    gl_FragColor = vec4(color.r, color.g, color.b, opacity);
  } else if (mode == 0) {
    float pattern = (lineOrientation == 0)
      ? fract(vUv.y * lineOffset)
      : fract(vUv.x * lineOffset);
    if (pattern < lineWidth / lineOffset) {
      gl_FragColor = vec4(color.r, color.g, color.b, opacity);
    } else {
      gl_FragColor = vec4(color.r, color.g, color.b, 0.0);
    }
  }
}