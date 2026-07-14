precision highp float;

uniform sampler2D tScene1;
uniform sampler2D tScene2;
uniform float uProgress;

varying vec2 vUv;

void main() {
  vec4 color1 = texture2D(tScene1, vUv);
  vec4 color2 = texture2D(tScene2, vUv);
  
  // Simple crossfade between scenes
  vec4 finalColor = mix(color1, color2, uProgress);
  
  gl_FragColor = finalColor;
}
