import * as THREE from "three/webgpu";

export class PhysicsWireframe {
  active = false;
  lineSegments: THREE.LineSegments;
  private geometry: THREE.BufferGeometry;

  constructor(
    private world: any,
    private scene: THREE.Scene | null
  ) {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    this.geometry.setAttribute("color", new THREE.Float32BufferAttribute([], 4));
    this.lineSegments = new THREE.LineSegments(
      this.geometry,
      new THREE.LineBasicNodeMaterial({ vertexColors: true })
    );
  }

  syncScene() {
    if (!this.scene) return;
    if (this.active) this.scene.add(this.lineSegments);
    else this.scene.remove(this.lineSegments);
  }

  update() {
    if (!this.active) return;
    const { vertices, colors } = this.world.debugRender();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    this.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  }

  dispose() {
    this.scene?.remove(this.lineSegments);
    this.geometry.dispose();
    (this.lineSegments.material as THREE.Material).dispose();
  }
}
