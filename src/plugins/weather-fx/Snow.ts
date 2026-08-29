import * as THREE from "three/webgpu";
import { Fn, hash, mix, positionLocal, uniform, vec2, vec3 } from "three/tsl";
import { remapClamp } from "../shared/math";
import type { TimePlugin } from "../time/TimePlugin";
import type { WeatherPlugin } from "../weather/WeatherPlugin";

export type SnowOptions = {
  size?: number;
  subdivisions?: number;
  getCenter?: () => THREE.Vector2;
};

export class Snow {
  mesh: THREE.Mesh;
  elevation: any;
  private center: any;
  private getCenter?: () => THREE.Vector2;

  constructor(
    private scene: THREE.Scene,
    private weather: WeatherPlugin,
    private time: TimePlugin,
    options: SnowOptions = {}
  ) {
    const size = options.size ?? 40;
    const subdivisions = options.subdivisions ?? 128;
    this.getCenter = options.getCenter;
    this.elevation = uniform(-1);
    this.center = uniform(vec2());

    const geometry = new THREE.PlaneGeometry(size, size, subdivisions, subdivisions);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardNodeMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
    });
    const self = this;
    material.positionNode = Fn(() => {
      const pos = positionLocal.toVar();
      const n = hash(pos.xz.mul(12.9898)).mul(0.35);
      pos.y.addAssign(self.elevation.add(n).max(0));
      return pos;
    })();
    material.colorNode = mix(vec3(0.55, 0.6, 0.65), vec3(1, 1, 1), self.elevation.add(1).mul(0.5));

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  update() {
    const rainRatio =
      remapClamp(this.weather.rain.value, 0.05, 0.3, 0, 1) *
      remapClamp(this.weather.temperature.value, 0, -5, 0, 1);
    const meltRatio = remapClamp(this.weather.temperature.value, 0, 10, 0, -1);
    const target = remapClamp(rainRatio + meltRatio, -1, 1, -1, 0.5);
    const delta = this.time.day.progressDelta;
    this.elevation.value += (target - this.elevation.value) * Math.min(1, Math.abs(delta) * 8 + 0.02);
    const center = this.getCenter?.();
    if (center) this.mesh.position.set(center.x, 0, center.y);
    this.mesh.visible = this.elevation.value > -0.85;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
