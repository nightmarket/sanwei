import * as THREE from "three";
import { Manager } from "../core/Manager";

const triangleGeometry = new THREE.BufferGeometry();
const vertices = new Float32Array([
  -1,
  -1, // bottom-left
  3,
  -1, // bottom-right (over-extended to reach top-right)
  -1,
  3, // top-left (over-extended to reach top-right)
]);
triangleGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 2));
const uvs = new Float32Array([
  0.0,
  0.0, // bottom-left
  2.0,
  0.0, // bottom-right
  0.0,
  2.0, // top-left
]);
triangleGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

export const TriangleGeometry = triangleGeometry;
export const TriangleVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

export class ScreenQuad {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0);

    this.renderTarget = new THREE.WebGLRenderTarget(1280, 1280); // TODO:
  }

  update() {
    // TODO: check tonemapping
    Manager.renderer.setRenderTarget(this.renderTarget);
    Manager.renderer.render(this.scene, this.camera);
    Manager.renderer.setRenderTarget(null);
  }
}
