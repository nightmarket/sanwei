import type * as THREETypes from "three";
import { THREE } from "../three-adapter";
import { GlobalUniforms } from "./globalUniformsAdapter";

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

  constructor({
    type = "perspective",
    fov = 120,
    position,
    near = 1,
    far = 1000,
    lookAt,
  }: CameraConfig) {
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
      this.camera.aspect =
        GlobalUniforms.uScreen.value.x / GlobalUniforms.uScreen.value.y;
    }

    this.camera.updateProjectionMatrix();
  }

  update() {}
}
