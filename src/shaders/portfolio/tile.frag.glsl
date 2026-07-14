uniform sampler2D tReel;
uniform vec2 uMaxUv;
uniform vec2 uMinUv;

varying vec2 vUv;

// projection
uniform vec3 projPosition;
varying vec3 vNormal;
varying vec4 vWorldPosition;
varying vec4 vTexCoords;

uniform float uUseProjectedUvs;
// end projection

#include <MAP>
#include <REVEAL>

#pragma glslify: snoise4 = require(glsl-noise/simplex/4d)


void main() {
  vec2 reelUv = map(vUv, vec2(0.), vec2(1.), uMinUv, uMaxUv);
  vec2 projectedUv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;


  vec4 outColor = texture2D(tReel, mix(reelUv, projectedUv, uUseProjectedUvs));

  // this makes sure we don't render also the back of the object
  // vec3 projectorDirection = normalize(projPosition - vWorldPosition.xyz);
  // float dotProduct = dot(vNormal, projectorDirection);
  // if (dotProduct < 0.0) {
  //   vec3 color = vec3(1.);
  //   outColor = vec4(color, 1.0);
  // }
  // gl_FragColor = vec4(1.);



  
  
  outColor = reveal(outColor, reelUv.x);

  gl_FragColor = outColor;
  // gl_FragColor = color;
}