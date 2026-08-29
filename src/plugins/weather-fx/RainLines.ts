import * as THREE from "three/webgpu";
import { attribute, Fn, fract, mod, step, uniform, vec2 } from "three/tsl";
import { lerp, remapClamp } from "../shared/math";
import type { WeatherPlugin } from "../weather/WeatherPlugin";

export type RainLinesOptions = {
  count?: number;
  size?: number;
  getCenter?: () => THREE.Vector2;
};

export class RainLines {
  mesh: THREE.Mesh;
  visibleRatio: any;
  length: any;
  incline: any;
  localTime: any;
  size: any;
  center: any;
  speed = 0.25;

  constructor(
    private scene: THREE.Scene,
    private weather: WeatherPlugin,
    options: RainLinesOptions = {}
  ) {
    const count = options.count ?? 2 ** 11;
    const geometry = new THREE.BufferGeometry();
    const positionArray = new Float32Array(count * 4 * 3);
    const offsetArray = new Float32Array(count * 4 * 2);
    const randomArray = new Float32Array(count * 4);
    const indexArray = new Uint16Array(count * 6);

    for (let lineIndex = 0; lineIndex < count; lineIndex++) {
      const x = Math.random();
      const z = Math.random();
      const random = Math.random();
      for (let vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
        const positionIndex = (lineIndex * 4 + vertexIndex) * 3;
        positionArray[positionIndex] = x;
        positionArray[positionIndex + 2] = z;
        const offsetIndex = (lineIndex * 4 + vertexIndex) * 2;
        if (vertexIndex === 0 || vertexIndex === 1) offsetArray[offsetIndex] = 1;
        if (vertexIndex === 0 || vertexIndex === 3) offsetArray[offsetIndex + 1] = 1;
        randomArray[lineIndex * 4 + vertexIndex] = random;
      }
      indexArray[lineIndex * 6] = lineIndex * 4;
      indexArray[lineIndex * 6 + 1] = lineIndex * 4 + 3;
      indexArray[lineIndex * 6 + 2] = lineIndex * 4 + 2;
      indexArray[lineIndex * 6 + 3] = lineIndex * 4 + 2;
      indexArray[lineIndex * 6 + 4] = lineIndex * 4 + 1;
      indexArray[lineIndex * 6 + 5] = lineIndex * 4;
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positionArray, 3));
    geometry.setAttribute("offset", new THREE.Float32BufferAttribute(offsetArray, 2));
    geometry.setAttribute("random", new THREE.Float32BufferAttribute(randomArray, 1));
    geometry.index = new THREE.Uint16BufferAttribute(indexArray, 1);

    this.thickness = uniform(0.015);
    this.elevation = uniform(20);
    this.incline = uniform(0.2);
    this.size = uniform(options.size ?? 40);
    this.center = uniform(vec2());
    this.length = uniform(2);
    this.localTime = uniform(0);
    this.visibleRatio = uniform(0);
    this.getCenter = options.getCenter;

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      color: 0xc8e6ff,
    });
    const self = this;
    material.positionNode = Fn(() => {
      const newPosition = attribute("position").toVar();
      const offset = attribute("offset");
      const random = attribute("random");
      const tangent = vec2(0.707, -0.707);
      newPosition.xz.mulAssign(self.size);
      newPosition.xz.subAssign(self.center);
      const halfSize = self.size.mul(0.5);
      newPosition.x.assign(mod(newPosition.x.add(halfSize), self.size).sub(halfSize));
      newPosition.z.assign(mod(newPosition.z.add(halfSize), self.size).sub(halfSize));
      newPosition.xz.addAssign(self.center);
      newPosition.xz.addAssign(tangent.mul(offset.x.mul(self.thickness)));
      const progress = self.localTime.add(random).mod(1);
      newPosition.y.assign(self.elevation.add(self.length));
      newPosition.y.subAssign(self.length.mul(offset.y.oneMinus()));
      newPosition.y.subAssign(progress.mul(self.elevation.add(self.length)));
      newPosition.y.assign(newPosition.y.clamp(0, self.elevation));
      const visible = step(self.visibleRatio, fract(random.mul(99)));
      newPosition.y.addAssign(visible.mul(99));
      newPosition.xz.addAssign(tangent.mul(newPosition.y.mul(self.incline).mul(-1)));
      return newPosition;
    })();

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.scene.add(this.mesh);
  }

  private thickness: any;
  private elevation: any;
  private getCenter?: () => THREE.Vector2;

  update(delta: number) {
    this.visibleRatio.value = this.weather.rain.value ** 2;
    const snowRatio = 1 - (1 - Math.max(this.weather.snow.value, 0)) ** 4;
    this.length.value = lerp(remapClamp(this.weather.rain.value, 0, 1, 1, 3), 0.03, snowRatio);
    this.speed = lerp(remapClamp(this.weather.rain.value, 0, 1, 0.2, 0.4), 0.05, snowRatio);
    this.incline.value = remapClamp(this.weather.wind.value, 0, 1, 0.1, 0.4);
    this.mesh.visible = this.visibleRatio.value > 0.00001;
    if (this.mesh.visible) {
      const center = this.getCenter?.();
      if (center) this.center.value.set(center.x, center.y);
      this.localTime.value += delta * this.speed;
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
