import type * as THREETypes from "three";
import { THREE } from "../three-adapter";

export type PhysicsBodyOptions = {
  object: THREETypes.Object3D;
  /** World units / second. */
  velocity?: THREETypes.Vector3;
  /** World-space rotation axis scaled by radians / second. */
  angularVelocity?: THREETypes.Vector3;
  /** Energy kept on bounce (1 = perfectly elastic). */
  restitution?: number;
};

const _box = /* lazily created */ { current: null as THREETypes.Box3 | null };
const _mat = { current: null as THREETypes.Matrix4 | null };
const _center = { current: null as THREETypes.Vector3 | null };
const _vertex = { current: null as THREETypes.Vector3 | null };

/**
 * A kinematic body with an exact vertex-set collider. The object's unique
 * vertex positions are captured once in local space; each step they are
 * rotated into world space, so the world AABB (and any plane tests) hug the
 * actual rotated silhouette — a spinning torus bounces exactly when its
 * surface reaches the wall, not when a conservative box does.
 *
 * Cost is O(unique vertices) per step, intended for a handful of showpiece
 * meshes (hundreds to a few thousand vertices), not dense scanned models.
 * Bodies without geometry fall back to a rotated-extents box collider.
 */
export class PhysicsBody {
  object: THREETypes.Object3D;
  velocity: THREETypes.Vector3;
  angularVelocity: THREETypes.Vector3;
  restitution: number;

  /** Local AABB half-extents at identity rotation (rotated-extents fallback). */
  readonly halfExtents: THREETypes.Vector3;
  /** Local AABB center offset from the object origin. */
  readonly localCenter: THREETypes.Vector3;
  /** Exact world-space AABB of the rotated mesh — refreshed by `updateWorldAABB()` each step. */
  readonly worldAABB: THREETypes.Box3;

  /** Deduplicated vertex positions in body-local space (xyz triplets). Empty when the object has no geometry. */
  localPoints: Float32Array = new Float32Array(0);
  /** The same points in world space, valid after `updateWorldAABB()` (xyz triplets). */
  worldPoints: Float32Array = new Float32Array(0);

  constructor({ object, velocity, angularVelocity, restitution = 1 }: PhysicsBodyOptions) {
    this.object = object;
    this.velocity = velocity ?? new THREE.Vector3();
    this.angularVelocity = angularVelocity ?? new THREE.Vector3();
    this.restitution = restitution;
    this.halfExtents = new THREE.Vector3();
    this.localCenter = new THREE.Vector3();
    this.worldAABB = new THREE.Box3();

    this.computeLocalBounds();
    this.updateWorldAABB();
  }

  /**
   * Capture the collider with position, rotation, and the body's own scale
   * zeroed: the deduplicated vertex set (child local transforms kept) plus
   * the local AABB used as fallback. `updateWorldAABB()` reapplies the body's
   * scale, rotation, and position each step. Assumes ancestors carry no
   * transforms of their own — true for bodies added directly to a scene.
   */
  computeLocalBounds() {
    _box.current ??= new THREE.Box3();
    _vertex.current ??= new THREE.Vector3();

    const { object } = this;
    const prevPosition = object.position.clone();
    const prevQuaternion = object.quaternion.clone();
    const prevScale = object.scale.clone();

    object.position.set(0, 0, 0);
    object.quaternion.identity();
    object.scale.set(1, 1, 1);
    object.updateMatrixWorld(true);

    _box.current.setFromObject(object);
    _box.current.getCenter(this.localCenter);
    _box.current.getSize(this.halfExtents).multiplyScalar(0.5);

    // Collect unique vertex positions in body-local space. Seams and shared
    // corners collapse (a TorusGeometry's ~1.2k entries dedup by ~6%, a box's
    // 24 down to 8), keeping the per-step transform loop as small as possible.
    const vertex = _vertex.current;
    const seen = new Set<string>();
    const points: number[] = [];
    object.traverse((child) => {
      const position = (child as THREETypes.Mesh).geometry?.getAttribute?.("position");
      if (!position) return;
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position as THREETypes.BufferAttribute, i).applyMatrix4(child.matrixWorld);
        const key = `${Math.round(vertex.x * 1e4)},${Math.round(vertex.y * 1e4)},${Math.round(vertex.z * 1e4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        points.push(vertex.x, vertex.y, vertex.z);
      }
    });
    this.localPoints = new Float32Array(points);
    this.worldPoints = new Float32Array(points.length);

    object.position.copy(prevPosition);
    object.quaternion.copy(prevQuaternion);
    object.scale.copy(prevScale);
    object.updateMatrixWorld(true);
  }

  /** Rotate the vertex set into world space and take its exact AABB. */
  updateWorldAABB() {
    const local = this.localPoints;
    if (local.length === 0) {
      this.updateWorldAABBFromExtents();
      return;
    }

    const world = this.worldPoints;
    const { x: qx, y: qy, z: qz, w: qw } = this.object.quaternion;
    const { x: px, y: py, z: pz } = this.object.position;
    const { x: sx, y: sy, z: sz } = this.object.scale;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < local.length; i += 3) {
      const vx = local[i]! * sx;
      const vy = local[i + 1]! * sy;
      const vz = local[i + 2]! * sz;

      // v' = q · v · q⁻¹, expanded (same math as Vector3.applyQuaternion).
      const tx = 2 * (qy * vz - qz * vy);
      const ty = 2 * (qz * vx - qx * vz);
      const tz = 2 * (qx * vy - qy * vx);
      const wx = vx + qw * tx + qy * tz - qz * ty + px;
      const wy = vy + qw * ty + qz * tx - qx * tz + py;
      const wz = vz + qw * tz + qx * ty - qy * tx + pz;

      world[i] = wx;
      world[i + 1] = wy;
      world[i + 2] = wz;

      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }

    this.worldAABB.min.set(minX, minY, minZ);
    this.worldAABB.max.set(maxX, maxY, maxZ);
  }

  /** Geometry-less fallback: rotated-extents AABB `|R| · halfExtents` around the local box. */
  private updateWorldAABBFromExtents() {
    _mat.current ??= new THREE.Matrix4();
    _center.current ??= new THREE.Vector3();

    const e = _mat.current.makeRotationFromQuaternion(this.object.quaternion).elements;
    const { x: sx, y: sy, z: sz } = this.object.scale;
    const hx = this.halfExtents.x * sx;
    const hy = this.halfExtents.y * sy;
    const hz = this.halfExtents.z * sz;

    const wx = Math.abs(e[0]!) * hx + Math.abs(e[4]!) * hy + Math.abs(e[8]!) * hz;
    const wy = Math.abs(e[1]!) * hx + Math.abs(e[5]!) * hy + Math.abs(e[9]!) * hz;
    const wz = Math.abs(e[2]!) * hx + Math.abs(e[6]!) * hy + Math.abs(e[10]!) * hz;

    const center = _center.current
      .copy(this.localCenter)
      .multiply(this.object.scale)
      .applyQuaternion(this.object.quaternion)
      .add(this.object.position);

    this.worldAABB.min.set(center.x - wx, center.y - wy, center.z - wz);
    this.worldAABB.max.set(center.x + wx, center.y + wy, center.z + wz);
  }

  /**
   * Shift the body and its cached world-space collider coherently — used by
   * collision resolution so pushes stay consistent within one step without a
   * full re-transform.
   */
  translate(dx: number, dy: number, dz: number) {
    this.object.position.x += dx;
    this.object.position.y += dy;
    this.object.position.z += dz;
    this.worldAABB.min.x += dx;
    this.worldAABB.min.y += dy;
    this.worldAABB.min.z += dz;
    this.worldAABB.max.x += dx;
    this.worldAABB.max.y += dy;
    this.worldAABB.max.z += dz;

    const world = this.worldPoints;
    for (let i = 0; i < world.length; i += 3) {
      world[i]! += dx;
      world[i + 1]! += dy;
      world[i + 2]! += dz;
    }
  }
}
