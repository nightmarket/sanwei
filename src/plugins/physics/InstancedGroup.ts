import * as THREE from "three/webgpu";

/** Sync many Object3D references onto InstancedMeshes cloned from a source group. */
export class InstancedGroup {
  meshes: Array<{ localMatrix: THREE.Matrix4; instance: THREE.InstancedMesh }> = [];
  needsUpdate = false;
  count: number;

  constructor(
    public references: THREE.Object3D[],
    group: THREE.Object3D,
    scene: THREE.Scene | null
  ) {
    this.count = references.length;
    group.traverse((child: any) => {
      if (!child.isMesh) return;
      child.updateMatrix();
      child.updateWorldMatrix(true, false);
      const instance = new THREE.InstancedMesh(child.geometry, child.material, this.count);
      instance.name = child.name;
      instance.castShadow = child.castShadow;
      instance.receiveShadow = child.receiveShadow;
      instance.frustumCulled = child.frustumCulled;
      scene?.add(instance);
      this.meshes.push({ localMatrix: child.matrix.clone(), instance });
    });
    this.update();
  }

  static getReferencesFromChildren(children: THREE.Object3D[]) {
    return children.map((child) => {
      const reference = new THREE.Object3D();
      reference.position.copy(child.position);
      reference.rotation.copy(child.rotation);
      reference.scale.copy(child.scale);
      (reference as any).needsUpdate = true;
      return reference;
    });
  }

  update() {
    let updated = 0;
    let i = 0;
    for (const reference of this.references) {
      if (this.needsUpdate || (reference as any).needsUpdate) {
        updated += 1;
        (reference as any).needsUpdate = false;
        reference.updateMatrixWorld(true);
        for (const mesh of this.meshes) {
          const finalMatrix = mesh.localMatrix.clone().premultiply(reference.matrixWorld);
          mesh.instance.setMatrixAt(i, finalMatrix);
        }
      }
      i += 1;
    }
    if (updated) {
      for (const mesh of this.meshes) mesh.instance.instanceMatrix.needsUpdate = true;
    }
    this.needsUpdate = false;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.instance.removeFromParent();
      mesh.instance.dispose();
    }
  }
}
