import { OrthographicCamera, Scene, WebGLRenderTarget } from "three";
import { createBigTriangle } from "../util/triangle";

export const TriangleGeometry = createBigTriangle();
export const TriangleVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

export class ScreenQuad {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0);
    this.renderTarget = new WebGLRenderTarget(1280, 1280);
  }

  update() {
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }
}
