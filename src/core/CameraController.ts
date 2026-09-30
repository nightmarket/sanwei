import { OrthographicCamera, PerspectiveCamera, type Vector3 } from "three";
import type { AppUniformsShape } from "./globalUniformsAdapter";

type CameraType = "perspective" | "orthographic";

export type CameraConfig = {
  type?: CameraType;
  fov?: number;
  position?: Vector3;
  near?: number;
  far?: number;
  lookAt?: Vector3;
  key?: string;
};

export class CameraController {
  camera: PerspectiveCamera | OrthographicCamera;

  constructor(
    { type = "perspective", fov = 120, position, near = 1, far = 1000, lookAt }: CameraConfig,
    private uniforms: AppUniformsShape
  ) {
    this.camera =
      type === "perspective"
        ? new PerspectiveCamera(fov, 1, near, far)
        : new OrthographicCamera(-1, 1, 1, -1, near, far);

    if (position) this.camera.position.copy(position);
    if (lookAt) this.camera.lookAt(lookAt);

    this.resize();
  }

  resize() {
    const { x, y } = this.uniforms.uScreen.value;
    if ("aspect" in this.camera && x > 0 && y > 0) {
      this.camera.aspect = x / y;
    }
    this.camera.updateProjectionMatrix();
  }
}
