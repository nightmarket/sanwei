import type * as THREETypes from "three";
import { THREE } from "../three-adapter";
import type { AppUniformsShape } from "./globalUniformsAdapter";

type CameraType = "perspective" | "orthographic";

export type CameraConfig = {
  type?: CameraType;
  fov?: number;
  position?: THREETypes.Vector3;
  near?: number;
  far?: number;
  lookAt?: THREETypes.Vector3;
  key?: string;
};

export class CameraController {
  camera: THREETypes.PerspectiveCamera | THREETypes.OrthographicCamera;
  private uniforms: AppUniformsShape;

  constructor(
    { type = "perspective", fov = 120, position, near = 1, far = 1000, lookAt }: CameraConfig,
    uniforms: AppUniformsShape
  ) {
    this.uniforms = uniforms;

    if (!position) {
      position = new THREE.Vector3(0, 0, 0);
    }

    if (type === "perspective") {
      this.camera = new THREE.PerspectiveCamera(fov, 1, near, far);
    } else {
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, near, far);
    }

    this.camera.position.copy(position);

    if (lookAt) {
      this.camera.lookAt(lookAt);
    }

    this.resize();
  }

  resize() {
    if (!this.camera) return;

    if ("aspect" in this.camera) {
      const { x, y } = this.uniforms.uScreen.value;
      if (x > 0 && y > 0) {
        this.camera.aspect = x / y;
      }
    }

    this.camera.updateProjectionMatrix();
  }

  update() {}
}
