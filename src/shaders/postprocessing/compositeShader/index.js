import { CopyShader } from "three/addons/shaders/CopyShader.js";

const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uRGBShift;
uniform float uK1;
uniform float uK2;
uniform float uProgress;

uniform float uNoiseOpacity;
uniform float uMonochrome;

varying vec2 vUv;

// https://github.com/jamieowen/glsl-blend
float blendOverlay(float base, float blend) {
	return base<0.5?(2.0*base*blend):(1.0-2.0*(1.0-base)*(1.0-blend));
}

vec3 blendOverlay(vec3 base, vec3 blend) {
	return vec3(blendOverlay(base.r,blend.r),blendOverlay(base.g,blend.g),blendOverlay(base.b,blend.b));
}

vec3 blendOverlay(vec3 base, vec3 blend, float opacity) {
	return (blendOverlay(base, blend) * opacity + base * (1.0 - opacity));
}

vec3 chromaAB( sampler2D tex, vec2 uv, vec2 offset, float pct)
{
  #ifdef CHROMAAB_CENTER_BUFFER
    // modify the distance from the center, so that only the edges are affected
    offset = max(offset - CHROMAAB_CENTER_BUFFER, 0.);
  #endif

  // Distort the UVs
  vec2 uvR = uv * (1.0 + offset * 0.02 * pct), uvB = uv * (1.0 - offset * 0.02 * pct);

  // Get the individual channels using the modified UVs
  vec3 c;
  c.r = texture2D(tex, uvR).r;
  c.g = texture2D(tex, uv).g;
  c.b = texture2D(tex, uvB).b;
  return c;
}

// https://www.shadertoy.com/view/wtBXRz
vec2 brownConradyDistortion(in vec2 uv, in float k1, in float k2)
{
  uv = uv * 2.0 - 1.0;	// brown conrady takes [-1:1]

  // positive values of K1 give barrel distortion, negative give pincushion
  float r2 = uv.x*uv.x + uv.y*uv.y;
  uv *= 1.0 + k1 * r2 + k2 * r2 * r2;

  // tangential distortion (due to off center lens elements)
  // is not modeled in this function, but if it was, the terms would go here
  uv = (uv * .5 + .5);	// restore -> [0:1]
  return uv;
}

vec3 contrast(vec3 color, float value) {
  return 0.5 + (1.0 + value) * (color - 0.5);
}

float random (in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
  vec2 uv = brownConradyDistortion( vUv, uK1, uK2 );

  vec3 color = chromaAB(tDiffuse, uv, vec2(uRGBShift), 1.5);

  color.rgb = blendOverlay(color.rgb, vec3(random(vUv + mod(uTime, 1.))), uNoiseOpacity);

  color.rgb = mix(color.rgb, vec3(0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b), uMonochrome);
  color.rgb = contrast(color.rgb, uMonochrome * .4);

  // luma fade
  float m = step(distance(vec3(1.), color), uProgress);
  color = mix(mix(vec3(1.), color, m), color, pow(uProgress, 1.5));

  gl_FragColor = vec4(color, 1.);
}
`;

export const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader,
};
