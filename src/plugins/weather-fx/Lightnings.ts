import * as THREE from "three/webgpu";
import type { WeatherPlugin } from "../weather/WeatherPlugin";

export type LightningsOptions = {
  frequency?: number;
  getStrikePoint?: () => THREE.Vector3;
  onStrike?: (point: THREE.Vector3) => void;
};

export class Lightnings {
  group = new THREE.Group();
  frequency: number;
  hitChances = 0;
  intensity = 0;

  private currentSecond = Math.floor(Date.now() / 1000);
  private line: THREE.Line;
  private flash: THREE.PointLight;
  private getStrikePoint?: () => THREE.Vector3;
  private onStrike?: (point: THREE.Vector3) => void;

  constructor(
    private scene: THREE.Scene,
    private weather: WeatherPlugin,
    options: LightningsOptions = {}
  ) {
    this.frequency = options.frequency ?? 2;
    this.getStrikePoint = options.getStrikePoint;
    this.onStrike = options.onStrike;

    const positions = buildBolt(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, 0, 0));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicNodeMaterial({ color: 0x5180ff });
    this.line = new THREE.Line(geometry, material);
    this.line.visible = false;
    this.flash = new THREE.PointLight(0x9bb6ff, 0, 40);
    this.group.add(this.line, this.flash);
    this.scene.add(this.group);
  }

  update(delta: number) {
    this.hitChances =
      Math.max(0, this.weather.clouds.value) *
      Math.max(0, this.weather.electricField.value) *
      this.weather.humidity.value;

    const second = Math.floor(Date.now() / 1000);
    if (second !== this.currentSecond) {
      this.currentSecond = second;
      if (Math.random() < this.hitChances / this.frequency) this.strike();
    }

    if (this.intensity > 0) {
      this.intensity = Math.max(0, this.intensity - delta * 6);
      this.flash.intensity = this.intensity * 20;
      (this.line.material as THREE.LineBasicNodeMaterial).opacity = this.intensity;
      if (this.intensity <= 0) this.line.visible = false;
    }
  }

  strike(point = this.getStrikePoint?.() ?? new THREE.Vector3()) {
    const start = point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 24, (Math.random() - 0.5) * 8));
    const positions = buildBolt(start, point);
    this.line.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.line.geometry.computeBoundingSphere();
    this.line.visible = true;
    this.flash.position.copy(point).add(new THREE.Vector3(0, 2, 0));
    this.intensity = 1;
    this.onStrike?.(point);
  }

  dispose() {
    this.scene.remove(this.group);
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}

function buildBolt(from: THREE.Vector3, to: THREE.Vector3, segments = 16) {
  const positions: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = from.clone().lerp(to, t);
    if (i > 0 && i < segments) {
      point.x += (Math.random() - 0.5) * 2.2;
      point.z += (Math.random() - 0.5) * 2.2;
    }
    positions.push(point.x, point.y, point.z);
  }
  return positions;
}
