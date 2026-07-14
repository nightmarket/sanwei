varying vec2 vUv;
varying float vProgress;

void main() {
    vUv = uv;
    vProgress = uv.x; // Use UV x coordinate as progress along the line
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
} 