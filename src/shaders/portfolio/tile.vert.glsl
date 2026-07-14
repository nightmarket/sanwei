varying vec2 vUv;
varying vec4 vWorldPosition;
varying vec3 vNormal;
varying vec4 vTexCoords;

uniform mat4 savedModelMatrix;
uniform mat4 viewMatrixCamera;
uniform mat4 projectionMatrixCamera;
uniform mat4 modelMatrixCamera;

uniform float uButterflies;
uniform vec2 uShift;

#define PI 3.141592

void main() {
  vUv = uv;

  // projection
  vNormal = mat3(savedModelMatrix) * normal;
  vWorldPosition = savedModelMatrix * vec4(position, 1.0);
  vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;

  vec3 pos = position;
  pos.x += ((sin(uv.y * PI) * uShift.x * 2.0) * 4.);
  pos.y -= ((sin(uv.x * PI) * uShift.y * 2.0) * 4.);

  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.);
}