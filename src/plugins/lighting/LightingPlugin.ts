import * as THREE from "three/webgpu";
import { color, uniform } from "three/tsl";
import type { DebugContext } from "../../core/debugHelpers";
import { Device } from "../../core/Device";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";
import { type SceneTarget, whenSceneReady } from "../shared/scene";
import { TimePlugin } from "../time/TimePlugin";

export type LightingPluginOptions = SceneTarget & {
  useDayCycles?: boolean;
  phi?: number;
  theta?: number;
  phiAmplitude?: number;
  thetaAmplitude?: number;
  radius?: number;
  target?: THREE.Vector3;
  getTarget?: () => THREE.Vector3;
};

export class LightingPlugin implements ISanweiPlugin {
  readonly name = "lighting";
  readonly dependencies = ["time"];

  useDayCycles: boolean;
  phi: number;
  theta: number;
  phiAmplitude: number;
  thetaAmplitude: number;
  radius: number;
  spherical: THREE.Spherical;
  direction = new THREE.Vector3();
  directionUniform: any;
  colorUniform: any;
  intensityUniform: any;
  light!: THREE.DirectionalLight;
  shadowColor: any;

  private time: TimePlugin | null = null;
  private scene: any = null;
  private unsubs: Array<() => void> = [];
  private target = new THREE.Vector3();
  private mounted = false;

  constructor(private options: LightingPluginOptions = {}) {
    this.useDayCycles = options.useDayCycles ?? true;
    this.phi = options.phi ?? 0.63;
    this.theta = options.theta ?? 0.72;
    this.phiAmplitude = options.phiAmplitude ?? 0.62;
    this.thetaAmplitude = options.thetaAmplitude ?? 1.25;
    this.radius = options.radius ?? 20;
    this.spherical = new THREE.Spherical(this.radius, this.phi, this.theta);
  }

  install(app: SanweiApp) {
    this.time = app.plugin(TimePlugin);

    this.directionUniform = uniform(this.direction);
    this.colorUniform = uniform(color("#ffffff"));
    this.intensityUniform = uniform(1);
    this.shadowColor = uniform(color("#6d3fff"));

    this.light = new THREE.DirectionalLight(0xffffff, 5);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(Device.tier >= 2 ? 2048 : 512, Device.tier >= 2 ? 2048 : 512);
    this.light.shadow.camera.near = 1;
    this.light.shadow.camera.far = this.radius * 2 + 1;
    const amp = this.radius;
    this.light.shadow.camera.left = -amp;
    this.light.shadow.camera.right = amp;
    this.light.shadow.camera.top = amp;
    this.light.shadow.camera.bottom = -amp;
    this.light.shadow.bias = -0.001;
    this.light.shadow.normalBias = 0.1;

    this.unsubs.push(
      whenSceneReady(app, this.options, (scene) => {
        this.scene = scene;
        scene.add(this.light);
        scene.add(this.light.target);
        this.mounted = true;
      })
    );

    this.unsubs.push(
      app.ticker.on(() => {
        if (this.mounted) this.update();
      }, TICK_ORDER.LIGHTING)
    );
  }

  update() {
    if (this.useDayCycles && this.time) {
      const progressOffset = 9 / 16;
      const angle = -(this.time.day.progress + progressOffset) * Math.PI * 2;
      this.spherical.theta = this.theta + Math.sin(angle) * this.thetaAmplitude;
      this.spherical.phi = this.phi + Math.cos(angle) * 0.5 * this.phiAmplitude;
    } else {
      this.spherical.theta = this.theta;
      this.spherical.phi = this.phi;
    }
    this.spherical.radius = this.radius;
    this.direction.setFromSpherical(this.spherical).normalize();
    this.directionUniform.value.copy(this.direction);

    if (this.options.getTarget) this.target.copy(this.options.getTarget());
    else if (this.options.target) this.target.copy(this.options.target);

    this.light.position.setFromSpherical(this.spherical).add(this.target);
    this.light.target.position.copy(this.target);

    if (this.time) {
      this.colorUniform.value.copy(this.time.day.color("lightColor"));
      this.intensityUniform.value = this.time.day.number("lightIntensity");
      this.shadowColor.value.copy(this.time.day.color("shadowColor"));
      this.light.color.copy(this.time.day.color("lightColor"));
      this.light.intensity = this.time.day.number("lightIntensity");
    }
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "Lighting", expanded: false });
    folder.addBinding(this, "useDayCycles");
    folder.addBinding(this, "phi", { min: 0, max: Math.PI * 0.5 }).on("change", () => this.update());
    folder.addBinding(this, "theta", { min: -Math.PI, max: Math.PI }).on("change", () => this.update());
    folder.addBinding(this, "radius", { min: 1, max: 100 }).on("change", () => this.update());
  }

  dispose() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.scene?.remove(this.light);
    this.scene?.remove(this.light.target);
    this.time = null;
  }
}
