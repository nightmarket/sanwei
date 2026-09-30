import { PerspectiveCamera, Vector3 } from "three";
import { type CameraConfig, CameraController } from "./CameraController";
import type { DebugContext } from "./debugHelpers";
import type { AppUniformsShape } from "./globalUniformsAdapter";

type DebugOrbitControls = {
  enabled: boolean;
  enableDamping: boolean;
  update(): void;
  dispose(): void;
};

export const CAMERA_MANAGER_UNIFORMS = {
  enableOrbitControls: true,
};

type CameraManagerHost = {
  name: string;
  uniforms: AppUniformsShape;
  renderer: any;
};

/** Per-app camera registry: named controllers plus an optional debug orbit camera. */
export class CameraManager {
  controllers: Record<string, CameraController> = {};
  activeController: CameraController | null = null;
  orbitControls: DebugOrbitControls | null = null;
  debugCamera: PerspectiveCamera | null = null;

  constructor(private host: CameraManagerHost) {}

  async initDebug({ debug, pane }: DebugContext) {
    const debugCamera = new PerspectiveCamera(80, 1, 0.001, 1000);
    debugCamera.position.set(0, 0, 40);
    this.debugCamera = debugCamera;
    this.resize();

    this.orbitControls = await debug.createOrbitControls(debugCamera, this.host.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.enabled = CAMERA_MANAGER_UNIFORMS.enableOrbitControls;

    const cameraFolder = pane.addFolder({
      title: "🎥 Camera",
      expanded: false,
    });
    debug.register(this.host.name ? `CameraManager:${this.host.name}` : "CameraManager", cameraFolder);

    cameraFolder.addBinding(CAMERA_MANAGER_UNIFORMS, "enableOrbitControls").on("change", (ev) => {
      if (this.orbitControls) {
        this.orbitControls.enabled = ev.value;
      }
    });

    cameraFolder
      .addBinding(debugCamera, "fov", {
        min: 10,
        max: 180,
        step: 1,
      })
      .on("change", () => debugCamera.updateProjectionMatrix());

    cameraFolder.addBinding(debugCamera, "position");

    cameraFolder
      .addBinding(debugCamera, "zoom", {
        min: 0,
        max: 20,
        step: 0.5,
      })
      .on("change", () => debugCamera.updateProjectionMatrix());

    cameraFolder.addButton({ title: "Log Position" }).on("click", () => {
      debugCamera.updateMatrixWorld();
      const { x, y, z } = debugCamera.position.clone().applyMatrix4(debugCamera.matrixWorld);
      console.log(`Position: ${x}, ${y}, ${z}`);

      const lookAt = new Vector3(0, 0, -1).applyQuaternion(debugCamera.quaternion);
      console.log(`LookAt: ${lookAt.x}, ${lookAt.y}, ${lookAt.z}`);
    });
  }

  /** Returns the active camera, preferring debug camera when in debug mode. */
  getActiveCamera() {
    if (this.debugCamera && CAMERA_MANAGER_UNIFORMS.enableOrbitControls) {
      return this.debugCamera;
    }
    return this.activeController?.camera ?? null;
  }

  addCameras(configs: CameraConfig[]) {
    for (const config of configs) {
      this.addController(config.key || "default", config);
    }
  }

  addController(key: string, config: CameraConfig) {
    const controller = new CameraController(config, this.host.uniforms);
    this.controllers[key] = controller;
    this.activeController = controller;
  }

  setActiveController(key: string) {
    this.activeController = this.controllers[key] ?? null;
  }

  update() {
    if (CAMERA_MANAGER_UNIFORMS.enableOrbitControls && this.orbitControls) {
      this.orbitControls.update();
    }
  }

  resize() {
    this.activeController?.resize();

    const { x, y } = this.host.uniforms.uScreen.value;
    if (this.debugCamera && x > 0 && y > 0) {
      this.debugCamera.aspect = x / y;
      this.debugCamera.updateProjectionMatrix();
    }
  }

  destroy() {
    this.orbitControls?.dispose();
    this.orbitControls = null;
    this.controllers = {};
    this.activeController = null;
    this.debugCamera = null;
  }
}
