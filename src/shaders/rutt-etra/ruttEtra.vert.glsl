precision highp float;
uniform sampler2D tMap;
varying vec2 vUv;
uniform float displace;
uniform float multiplier;
uniform float originX;
uniform float originY;
uniform float originZ;

void main() {
  vec3 origin = vec3(originX, originY, originZ);
  vec4 color = texture2D(tMap, uv);
  vUv = uv;
  float depth = multiplier * (color.r + color.g + color.b);
  vec4 pos = vec4(normalize(position - origin) * depth * vec3(1.0, 1.0, displace), 0.0) + vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * pos;
}