import * as THREE from "three/webgpu";
import { remapClamp } from "../shared/math";
import type { WeatherPlugin } from "../weather/WeatherPlugin";

class WindLine {
  mesh: THREE.Mesh;
  available = true;
  progress = 0;
  duration = 4;

  constructor(private scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(4, 0.04);
    const material = new THREE.MeshBasicNodeMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  spawn(origin: THREE.Vector3, direction: THREE.Vector2) {
    this.available = false;
    this.progress = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(origin);
    this.mesh.rotation.y = Math.atan2(direction.x, direction.y);
    (this.mesh.material as THREE.MeshBasicNodeMaterial).opacity = 0;
  }

  update(delta: number, translation: number) {
    if (this.available) return;
    this.progress += delta / this.duration;
    const t = this.progress;
    const material = this.mesh.material as THREE.MeshBasicNodeMaterial;
    material.opacity = t < 0.2 ? t / 0.2 : t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;
    this.mesh.position.x += Math.sin(this.mesh.rotation.y) * translation * delta;
    this.mesh.position.z += Math.cos(this.mesh.rotation.y) * translation * delta;
    if (t >= 1) {
      this.available = true;
      this.mesh.visible = false;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export type WindLinesOptions = {
  pool?: number;
  getOrigin?: () => THREE.Vector3;
};

export class WindLines {
  private pool: WindLine[] = [];
  private cooldown = 0;
  private getOrigin?: () => THREE.Vector3;

  constructor(
    private scene: THREE.Scene,
    private weather: WeatherPlugin,
    options: WindLinesOptions = {}
  ) {
    this.getOrigin = options.getOrigin;
    const count = options.pool ?? 6;
    for (let i = 0; i < count; i++) this.pool.push(new WindLine(scene));
  }

  update(delta: number) {
    const wind = this.weather.wind.value;
    this.cooldown -= delta * 1000;
    if (wind > 0.45 && this.cooldown <= 0) {
      const line = this.pool.find((item) => item.available);
      if (line) {
        const origin = this.getOrigin?.() ?? new THREE.Vector3();
        origin.y += 1 + Math.random() * 3;
        origin.x += (Math.random() - 0.5) * 8;
        origin.z += (Math.random() - 0.5) * 8;
        line.spawn(origin, new THREE.Vector2(Math.sin(Math.PI * 0.6), Math.cos(Math.PI * 0.6)));
        this.cooldown = remapClamp(wind, 0.45, 1, 2000, 300);
      }
    }
    for (const line of this.pool) line.update(delta, 4);
  }

  dispose() {
    for (const line of this.pool) line.dispose();
  }
}
