import { THREE } from "../three-adapter";
import { type CameraConfig, CameraController } from "./CameraController";
import type { DebugContext } from "./debugHelpers";
import { RendererManager } from "./RendererManager";

type DebugOrbitControls = {
  enabled: boolean;
  update(): void;
  dispose(): void;
};

export const CAMERA_MANAGER_UNIFORMS = {
  enableOrbitControls: true,
};

export class CameraManagerClass {
  isSingleton = true;
  controllers: Record<string, CameraController> = {};
  activeController: CameraController | null = null;
  orbitControls: DebugOrbitControls | null = null;
  debugCamera: any = null;

  async init() {}

  async initDebug({ debug, pane }: DebugContext) {
    this.debugCamera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);
    this.debugCamera.position.set(0, 0, 40);

    this.orbitControls = await debug.createOrbitControls(this.debugCamera, RendererManager.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.enabled = CAMERA_MANAGER_UNIFORMS.enableOrbitControls;

    const cameraFolder = pane.addFolder({
      title: "🎥 Camera Manager",
      expanded: false,
    });
    debug.register("CameraManager", cameraFolder);

    cameraFolder.addBinding(CAMERA_MANAGER_UNIFORMS, "enableOrbitControls").on("change", (ev) => {
      if (this.orbitControls) {
        this.orbitControls.enabled = ev.value;
      }
    });

    cameraFolder
      .addBinding(this.debugCamera, "fov", {
        min: 10,
        max: 180,
        step: 1,
      })
      .on("change", () => {
        this.debugCamera.updateProjectionMatrix();
      });

    cameraFolder.addBinding(this.debugCamera, "position");

    cameraFolder
      .addBinding(this.debugCamera, "zoom", {
        min: 0,
        max: 20,
        step: 0.5,
      })
      .on("change", () => {
        this.debugCamera.updateProjectionMatrix();
      });

    cameraFolder.addButton({ title: "Log Position" }).on("click", () => {
      this.debugCamera.updateMatrixWorld();
      const position = this.debugCamera.position.clone().applyMatrix4(this.debugCamera.matrixWorld);

      const { x, y, z } = position;
      console.log(`Position: ${x}, ${y}, ${z}`);

      const lookAt = new THREE.Vector3(0, 0, -1);
      lookAt.applyQuaternion(this.debugCamera.quaternion);
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
    const controller = new CameraController(config);
    this.controllers[key] = controller;
    this.activeController = controller;
  }

  setActiveController(key: string) {
    this.activeController = this.controllers[key] ?? null;
  }

  update() {
    if (CAMERA_MANAGER_UNIFORMS.enableOrbitControls && this.orbitControls) {
      this.orbitControls.update();
    } else {
      this.activeController?.update();
    }
  }

  resize() {
    this.activeController?.resize();

    if (this.debugCamera) {
      this.debugCamera.aspect = window.innerWidth / window.innerHeight;
      this.debugCamera.updateProjectionMatrix();
    }
  }

  destroy() {
    this.orbitControls?.dispose();
    this.orbitControls = null;

    for (const controller of Object.values(this.controllers)) {
      controller.camera = null as any;
    }
    this.controllers = {};
    this.activeController = null;
    this.debugCamera = null;
  }
}

export const CameraManager = new CameraManagerClass();
