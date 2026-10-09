import { Box3, type BufferAttribute, Matrix4, type Mesh, type Object3D, Vector3 } from "three";
import { ConvexHull } from "three/addons/math/ConvexHull.js";

export type PhysicsBodyOptions = {
  object: Object3D;
  /** World units / second. */
  velocity?: Vector3;
  /** World-space rotation axis scaled by radians / second. */
  angularVelocity?: Vector3;
  /** Energy kept on bounce (1 = perfectly elastic). */
  restitution?: number;
  /** Convex pieces of a concave shape (e.g. a convex decomposition), as xyz triplets in the object's
   * local space. Body-body contacts test these instead of the whole convex hull, which would bounce
   * off the empty space a concave shape leaves inside it. */
  parts?: Float32Array[];
};

const _box = new Box3();
const _mat = new Matrix4();
const _center = new Vector3();
const _offset = new Vector3();

/** Rotates, scales, and places `local` into `world` (xyz triplets) as `object` does, and bounds them in
 * `box`. Same math as `Vector3.applyQuaternion`, expanded. */
function transformPoints(local: Float32Array, world: Float32Array, object: Object3D, box: Box3) {
  const { x: qx, y: qy, z: qz, w: qw } = object.quaternion;
  const { x: px, y: py, z: pz } = object.position;
  const { x: sx, y: sy, z: sz } = object.scale;

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

  box.min.set(minX, minY, minZ);
  box.max.set(maxX, maxY, maxZ);
}

function shiftPoints(world: Float32Array, dx: number, dy: number, dz: number) {
  for (let i = 0; i < world.length; i += 3) {
    world[i]! += dx;
    world[i + 1]! += dy;
    world[i + 2]! += dz;
  }
}
/** Below this fraction of the longest extent an axis counts as flat, and Quickhull needs volume. */
const FLAT_EXTENT_RATIO = 1e-4;

/**
 * The convex hull's vertices of a point set. Only those can be extreme along any direction, so
 * AABBs, plane contacts, and projected-hull SAT come out identical while the per-step loops shrink
 * (a ~5k-vertex wordmark keeps ~15% of its points).
 */
function hullVertices(points: Vector3[]) {
  const hull = new ConvexHull().setFromPoints(points);
  const vertices = new Set<Vector3>();
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      vertices.add(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  return vertices.size >= 4 ? [...vertices] : points;
}

/**
 * A kinematic body with an exact vertex-set collider. The object's convex-hull
 * vertices are captured once in local space; each step they are rotated into
 * world space, so the world AABB (and any plane tests) hug the actual rotated
 * silhouette — a spinning torus bounces exactly when its surface reaches the
 * wall, not when a conservative box does.
 *
 * Cost is O(hull vertices) per step, intended for a handful of showpiece
 * meshes (hundreds to a few thousand vertices), not dense scanned models.
 * Concave shapes pass convex `parts`, which ride along for body-body contacts.
 * Bodies without geometry fall back to a rotated-extents box collider.
 */
export class PhysicsBody {
  object: Object3D;
  velocity: Vector3;
  angularVelocity: Vector3;
  restitution: number;

  /** Local AABB half-extents at identity rotation (rotated-extents fallback). */
  readonly halfExtents = new Vector3();
  /** Local AABB center offset from the object origin. */
  readonly localCenter = new Vector3();
  /** Exact world-space AABB of the rotated mesh — refreshed by `updateWorldAABB()` each step. */
  readonly worldAABB = new Box3();

  /** Convex-hull vertex positions in body-local space (xyz triplets); every deduplicated vertex when the mesh is flat. Empty when the object has no geometry. */
  localPoints: Float32Array = new Float32Array(0);
  /** The same points in world space, valid after `updateWorldAABB()` (xyz triplets). */
  worldPoints: Float32Array = new Float32Array(0);
  /** Convex pieces body-body contacts test, in body-local space: the given `parts`, or the hull. */
  localParts: Float32Array[] = [];
  /** The pieces in world space and their bounds, valid after `updateWorldAABB()`. */
  worldParts: Float32Array[] = [];
  worldPartBounds: Box3[] = [];
  private readonly parts: Float32Array[] | null;

  constructor({ object, velocity, angularVelocity, restitution = 1, parts }: PhysicsBodyOptions) {
    this.object = object;
    this.velocity = velocity ?? new Vector3();
    this.angularVelocity = angularVelocity ?? new Vector3();
    this.restitution = restitution;
    this.parts = parts ?? null;

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
    const { object } = this;
    const prevPosition = object.position.clone();
    const prevQuaternion = object.quaternion.clone();
    const prevScale = object.scale.clone();

    object.position.set(0, 0, 0);
    object.quaternion.identity();
    object.scale.set(1, 1, 1);
    object.updateMatrixWorld(true);

    _box.setFromObject(object);
    _box.getCenter(this.localCenter);
    _box.getSize(this.halfExtents).multiplyScalar(0.5);

    // Collect unique vertex positions in body-local space. Seams and shared
    // corners collapse (a TorusGeometry's ~1.2k entries dedup by ~6%, a box's
    // 24 down to 8), then only the convex hull's vertices are kept.
    const seen = new Set<string>();
    const unique: Vector3[] = [];
    object.traverse((child) => {
      const position = (child as Mesh).geometry?.getAttribute?.("position");
      if (!position) return;
      for (let i = 0; i < position.count; i++) {
        const vertex = new Vector3()
          .fromBufferAttribute(position as BufferAttribute, i)
          .applyMatrix4(child.matrixWorld);
        const key = `${Math.round(vertex.x * 1e4)},${Math.round(vertex.y * 1e4)},${Math.round(vertex.z * 1e4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(vertex);
      }
    });
    const { x, y, z } = this.halfExtents;
    const hasVolume = Math.min(x, y, z) > Math.max(x, y, z) * FLAT_EXTENT_RATIO;
    const points = unique.length >= 4 && hasVolume ? hullVertices(unique) : unique;
    this.localPoints = new Float32Array(points.flatMap((point) => [point.x, point.y, point.z]));
    this.worldPoints = new Float32Array(this.localPoints.length);
    if (this.parts) {
      this.localParts = this.parts;
      this.worldParts = this.parts.map((part) => new Float32Array(part.length));
      this.worldPartBounds = this.parts.map(() => new Box3());
    } else {
      this.localParts = [this.localPoints];
      this.worldParts = [this.worldPoints];
      this.worldPartBounds = [this.worldAABB];
    }

    object.position.copy(prevPosition);
    object.quaternion.copy(prevQuaternion);
    object.scale.copy(prevScale);
    object.updateMatrixWorld(true);
  }

  /** Rotate the vertex set (and any convex pieces) into world space and take its exact AABB. */
  updateWorldAABB() {
    if (this.localPoints.length === 0) {
      this.updateWorldAABBFromExtents();
      return;
    }
    transformPoints(this.localPoints, this.worldPoints, this.object, this.worldAABB);
    if (!this.parts) return;
    for (let i = 0; i < this.parts.length; i++) {
      transformPoints(this.parts[i]!, this.worldParts[i]!, this.object, this.worldPartBounds[i]!);
    }
  }

  /** Geometry-less fallback: rotated-extents AABB `|R| · halfExtents` around the local box. */
  private updateWorldAABBFromExtents() {
    const e = _mat.makeRotationFromQuaternion(this.object.quaternion).elements;
    const { x: sx, y: sy, z: sz } = this.object.scale;
    const hx = this.halfExtents.x * sx;
    const hy = this.halfExtents.y * sy;
    const hz = this.halfExtents.z * sz;

    const wx = Math.abs(e[0]!) * hx + Math.abs(e[4]!) * hy + Math.abs(e[8]!) * hz;
    const wy = Math.abs(e[1]!) * hx + Math.abs(e[5]!) * hy + Math.abs(e[9]!) * hz;
    const wz = Math.abs(e[2]!) * hx + Math.abs(e[6]!) * hy + Math.abs(e[10]!) * hz;

    const center = _center
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
    shiftPoints(this.worldPoints, dx, dy, dz);
    if (!this.parts) return;
    _offset.set(dx, dy, dz);
    for (let i = 0; i < this.parts.length; i++) {
      shiftPoints(this.worldParts[i]!, dx, dy, dz);
      this.worldPartBounds[i]!.translate(_offset);
    }
  }
}
