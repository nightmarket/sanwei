import { Device } from "./Device";

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

const ORIENTATION_RANGE_DEGREES = 30;
const MAX_TILT_RADIANS = 0.05;

/** The phone's tilt, from `deviceorientation`. Opt-in: call `init()` to start it, since iOS asks the visitor
 * to allow motion access on their first tap. */
class AccelerometerClass {
  isSingleton = true;
  orientation = {
    x: 0,
    y: 0,
  };
  enabled = false;

  private orientationBaseline: { beta: number; gamma: number } | null = null;
  private isListeningToOrientation = false;
  private permissionEvents: string[] = [];

  private get orientationEventConstructor() {
    return window.DeviceOrientationEvent as DeviceOrientationEventWithPermission | undefined;
  }

  private supportsOrientation = () => typeof window !== "undefined" && !!this.orientationEventConstructor;

  private handleOrientation = (event: DeviceOrientationEvent) => {
    const { beta, gamma } = event;
    if (typeof beta !== "number" || typeof gamma !== "number") return;

    this.orientationBaseline ??= { beta, gamma };

    const deltaBeta = beta - this.orientationBaseline.beta;
    const deltaGamma = gamma - this.orientationBaseline.gamma;
    this.orientation.x = Math.max(-1, Math.min(1, deltaGamma / ORIENTATION_RANGE_DEGREES)) * MAX_TILT_RADIANS;
    this.orientation.y = Math.max(-1, Math.min(1, deltaBeta / ORIENTATION_RANGE_DEGREES)) * MAX_TILT_RADIANS;
    this.enabled = true;
  };

  private startOrientationListener = () => {
    if (this.isListeningToOrientation || !this.supportsOrientation()) return;
    window.addEventListener("deviceorientation", this.handleOrientation);
    window.addEventListener("orientationchange", this.resetOrientationBaseline);
    this.isListeningToOrientation = true;
  };

  /** iOS only asks from a user activation, which a touch's `pointerdown` isn't; a tap's `touchend` is. */
  private addPermissionListeners = () => {
    this.permissionEvents = ["touchend", "click"];
    for (const eventName of this.permissionEvents) {
      window.addEventListener(eventName, this.requestPermission);
    }
  };

  private removePermissionListeners = () => {
    for (const eventName of this.permissionEvents) {
      window.removeEventListener(eventName, this.requestPermission);
    }
    this.permissionEvents = [];
  };

  private resetOrientationBaseline = () => {
    this.orientationBaseline = null;
    this.orientation.x = 0;
    this.orientation.y = 0;
  };

  requestPermission = async () => {
    this.removePermissionListeners();
    const OrientationEvent = this.orientationEventConstructor;
    if (!OrientationEvent) return false;

    if (typeof OrientationEvent.requestPermission === "function") {
      try {
        const permission = await OrientationEvent.requestPermission();
        if (permission !== "granted") return false;
      } catch {
        // Asked outside a user gesture (a swipe's `touchend`): ask again on the next tap.
        this.addPermissionListeners();
        return false;
      }
    }

    this.startOrientationListener();
    return true;
  };

  init() {
    if (!Device.isMobile || !this.supportsOrientation()) return;

    if (typeof this.orientationEventConstructor?.requestPermission === "function") this.addPermissionListeners();
    else this.startOrientationListener();
  }

  destroy() {
    this.removePermissionListeners();
    if (this.isListeningToOrientation) {
      window.removeEventListener("deviceorientation", this.handleOrientation);
      window.removeEventListener("orientationchange", this.resetOrientationBaseline);
    }
    this.isListeningToOrientation = false;
    this.orientationBaseline = null;
    this.enabled = false;
    this.orientation.x = 0;
    this.orientation.y = 0;
  }
}

export const Accelerometer = new AccelerometerClass();
