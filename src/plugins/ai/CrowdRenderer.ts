import * as THREE from "three/webgpu";
import {
  add,
  Fn,
  instanceIndex,
  storage,
  transformNormal,
  transformNormalToView,
  uint,
  uniform,
  vec4,
  vertexIndex,
} from "three/tsl";

export type CrowdInstance = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  timeOffset: number;
};

export type CrowdPoseSource = (index: number, instance: CrowdInstance, delta: number) => void;

export type CrowdRendererOptions = {
  scene: THREE.Scene;
  skinnedMesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  mixer?: THREE.AnimationMixer;
  count: number;
  material?: THREE.Material;
  getPose?: CrowdPoseSource;
};

const DUMMY = new THREE.Object3D();

/**
 * WebGPU compute-skinned instanced crowd.
 * Feed headings via `getPose` or write `instances[i].position/quaternion` each frame.
 */
export class CrowdRenderer {
  count: number;
  instances: CrowdInstance[] = [];
  mesh!: THREE.Mesh;
  computeSkinning: any;
  animationTime = 0;

  private scene: THREE.Scene;
  private skinnedMesh: THREE.SkinnedMesh;
  private skeleton: THREE.Skeleton;
  private mixer?: THREE.AnimationMixer;
  private boneCount: number;
  private boneMatrices!: THREE.StorageBufferAttribute;
  private instanceMatrices!: THREE.StorageBufferAttribute;
  private getPose?: CrowdPoseSource;
  private sourceObject: THREE.Object3D;

  constructor(options: CrowdRendererOptions) {
    this.scene = options.scene;
    this.skinnedMesh = options.skinnedMesh;
    this.skeleton = options.skeleton;
    this.mixer = options.mixer;
    this.count = options.count;
    this.getPose = options.getPose;
    this.boneCount = this.skeleton.bones.length;
    this.sourceObject = this.skinnedMesh.parent ?? this.skinnedMesh;

    for (let i = 0; i < this.count; i++) {
      this.instances.push({
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        timeOffset: Math.random() * 2,
      });
    }

    this.initComputedMesh(options.material);
  }

  private initComputedMesh(materialOverride?: THREE.Material) {
    const source = this.skinnedMesh;
    const geometry = source.geometry.clone();
    const vertexCount = geometry.getAttribute("position").count;
    const instanceCount = this.count;

    this.boneMatrices = new THREE.StorageBufferAttribute(instanceCount * this.boneCount, 16);
    const boneMatricesNode = storage(this.boneMatrices, "mat4", this.boneMatrices.count).toReadOnly();
    this.instanceMatrices = new THREE.StorageBufferAttribute(instanceCount, 16);
    const instanceMatricesNode = storage(this.instanceMatrices, "mat4", instanceCount).toReadOnly();

    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const sourceData = new Float32Array(vertexCount * 8);
    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 8;
      sourceData[offset] = position.getX(i);
      sourceData[offset + 1] = position.getY(i);
      sourceData[offset + 2] = position.getZ(i);
      sourceData[offset + 4] = normal.getX(i);
      sourceData[offset + 5] = normal.getY(i);
      sourceData[offset + 6] = normal.getZ(i);
    }

    const sourceVertices = storage(
      new THREE.StorageBufferAttribute(sourceData, 4),
      "vec4",
      vertexCount * 2
    ).toReadOnly();
    const skinIndices = storage(
      new THREE.StorageBufferAttribute(new Uint32Array(geometry.getAttribute("skinIndex").array), 4),
      "uvec4",
      vertexCount
    ).toReadOnly();
    const skinWeights = storage(
      new THREE.StorageBufferAttribute(new Float32Array(geometry.getAttribute("skinWeight").array), 4),
      "vec4",
      vertexCount
    ).toReadOnly();

    const bindMatrix = uniform(source.bindMatrix, "mat4");
    const bindMatrixInverse = uniform(source.bindMatrixInverse, "mat4");
    const sourceWorldMatrix = uniform(source.matrixWorld, "mat4");
    const vertices = storage(
      new THREE.StorageBufferAttribute(instanceCount * vertexCount * 2, 4),
      "vec4",
      instanceCount * vertexCount * 2
    );
    const boneCount = this.boneCount;

    this.computeSkinning = Fn(() => {
      const sourceVertex = instanceIndex.mod(uint(vertexCount));
      const meshInstance = instanceIndex.div(uint(vertexCount));
      const sourceOffset = sourceVertex.mul(uint(2));
      const targetOffset = instanceIndex.mul(uint(2));
      const boneOffset = meshInstance.mul(uint(boneCount));
      const skinIndex = skinIndices.element(sourceVertex);
      const skinWeight = skinWeights.element(sourceVertex);
      const skinVertex = bindMatrix.mul(vec4(sourceVertices.element(sourceOffset).xyz, 1));
      const boneMatX = boneMatricesNode.element(boneOffset.add(skinIndex.x));
      const boneMatY = boneMatricesNode.element(boneOffset.add(skinIndex.y));
      const boneMatZ = boneMatricesNode.element(boneOffset.add(skinIndex.z));
      const boneMatW = boneMatricesNode.element(boneOffset.add(skinIndex.w));
      const skinMatrix = add(
        skinWeight.x.mul(boneMatX),
        skinWeight.y.mul(boneMatY),
        skinWeight.z.mul(boneMatZ),
        skinWeight.w.mul(boneMatW)
      );
      const skinPosition = bindMatrixInverse
        .mul(
          add(
            boneMatX.mul(skinWeight.x).mul(skinVertex),
            boneMatY.mul(skinWeight.y).mul(skinVertex),
            boneMatZ.mul(skinWeight.z).mul(skinVertex),
            boneMatW.mul(skinWeight.w).mul(skinVertex)
          )
        )
        .xyz;
      const skinNormal = bindMatrixInverse
        .mul(skinMatrix)
        .mul(bindMatrix)
        .transformDirection(sourceVertices.element(sourceOffset.add(uint(1))).xyz)
        .xyz;
      const instanceMatrix = instanceMatricesNode.element(meshInstance).mul(sourceWorldMatrix);
      vertices.element(targetOffset).assign(vec4(instanceMatrix.mul(vec4(skinPosition, 1)).xyz, 1));
      vertices.element(targetOffset.add(uint(1))).assign(vec4(transformNormal(skinNormal, instanceMatrix), 0));
    })().compute(instanceCount * vertexCount);

    const material =
      (materialOverride as any) ??
      new THREE.MeshStandardNodeMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0 });
    const meshVertex = instanceIndex.mul(uint(vertexCount)).add(vertexIndex).mul(uint(2));
    material.positionNode = vertices.element(meshVertex).xyz;
    material.normalNode = transformNormalToView(vertices.element(meshVertex.add(uint(1))).xyz).toVarying();

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.count = instanceCount;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  poseInstance(index: number) {
    const instance = this.instances[index]!;
    if (this.mixer) {
      this.mixer.setTime(this.animationTime + instance.timeOffset);
      this.sourceObject.updateMatrixWorld(true);
      this.skeleton.update();
    }
  }

  update(delta: number, renderer?: { compute: (node: any) => void }) {
    this.animationTime += delta;
    for (let i = 0; i < this.count; i++) {
      const instance = this.instances[i]!;
      this.getPose?.(i, instance, delta);
      DUMMY.position.copy(instance.position);
      DUMMY.quaternion.copy(instance.quaternion);
      DUMMY.updateMatrix();
      DUMMY.matrix.toArray(this.instanceMatrices.array, i * 16);
      this.poseInstance(i);
      this.boneMatrices.array.set(this.skeleton.boneMatrices, i * this.boneCount * 16);
    }
    this.boneMatrices.needsUpdate = true;
    this.instanceMatrices.needsUpdate = true;
    renderer?.compute(this.computeSkinning);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export function createCatmullRomPoseSource(
  paths: THREE.Vector3[][],
  speed = 0.2
): CrowdPoseSource {
  const dummy = new THREE.Object3D();
  const state = new Map<number, { path: number; progress: number }>();
  return (index, instance, delta) => {
    let current = state.get(index);
    if (!current) {
      current = { path: index % paths.length, progress: Math.random() };
      state.set(index, current);
    }
    current.progress = (current.progress + delta * speed) % 1;
    const points = paths[current.path]!;
    const idxFloat = current.progress * (points.length - 1);
    const idx = Math.floor(idxFloat);
    const next = points[Math.min(idx + 1, points.length - 1)]!;
    instance.position.copy(points[idx]!).lerp(next, idxFloat - idx);
    dummy.position.copy(instance.position);
    dummy.lookAt(next);
    instance.quaternion.copy(dummy.quaternion);
    if (idx >= points.length - 2) current.path = (current.path + 1) % paths.length;
  };
}
