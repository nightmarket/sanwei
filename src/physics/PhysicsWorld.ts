import type * as THREETypes from "three";
import { THREE } from "../three-adapter";
import { PhysicsBody, type PhysicsBodyOptions } from "./PhysicsBody";

export type PhysicsWorldOptions = {
  /** World-space walls the body colliders bounce inside. Omit for an unbounded world. */
  bounds?: THREETypes.Box3;
  /**
   * Arbitrary walls as inward-facing planes (positive signed distance =
   * inside). Use for perspective-exact viewport bounces: pass the camera's
   * frustum side planes and bodies reflect exactly when their silhouette
   * reaches the screen edge, at any depth. Checked in addition to `bounds`.
   */
  planes?: THREETypes.Plane[];
  /**
   * Constrain motion to the xy plane. Drift, plane push-out, and pair
   * separation never change z; plane normals are projected into xy so a
   * perspective frustum still produces exact screen-edge bounces without
   * injecting z velocity. Rotation is unaffected.
   */
  lockZ?: boolean;
  /** Step clamp in seconds — prevents tunneling after tab-away / focus delta spikes. */
  maxDelta?: number;
  /** Fired once per body per step when it reflects off a wall (box or plane). */
  onWallBounce?: (body: PhysicsBody) => void;
  /** Fired for each resolved body-body contact. */
  onBodyCollision?: (a: PhysicsBody, b: PhysicsBody) => void;
};

const DEFAULT_MAX_DELTA = 1 / 30;
const AXES_3D = ["x", "y", "z"] as const;
const AXES_2D = ["x", "y"] as const;
const PLANE_XY_EPSILON = 1e-4;

const _quat = { current: null as THREETypes.Quaternion | null };
const _axis = { current: null as THREETypes.Vector3 | null };

function buildConvexHull2D(points: Float32Array): number[] {
  const sorted = Array.from({ length: points.length / 3 }, (_, index) => index);
  sorted.sort((a, b) => points[a * 3]! - points[b * 3]! || points[a * 3 + 1]! - points[b * 3 + 1]!);

  const unique: number[] = [];
  for (const index of sorted) {
    const previous = unique.at(-1);
    if (
      previous !== undefined &&
      points[previous * 3] === points[index * 3] &&
      points[previous * 3 + 1] === points[index * 3 + 1]
    ) {
      continue;
    }
    unique.push(index);
  }
  if (unique.length <= 2) return unique;

  const cross = (origin: number, a: number, b: number) => {
    const ox = points[origin * 3]!;
    const oy = points[origin * 3 + 1]!;
    return (
      (points[a * 3]! - ox) * (points[b * 3 + 1]! - oy) -
      (points[a * 3 + 1]! - oy) * (points[b * 3]! - ox)
    );
  };

  const lower: number[] = [];
  for (const index of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, index) <= 0) lower.pop();
    lower.push(index);
  }

  const upper: number[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const index = unique[i]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, index) <= 0) upper.pop();
    upper.push(index);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Light kinematic physics for floating showpiece objects: drift + spin
 * integration, exact vertex-set wall bounces, and O(n²) equal-mass body
 * collisions. Locked-z pairs use projected convex-hull SAT after an AABB
 * broadphase; unrestricted 3D pairs use AABB resolution. Not for stacks or joints.
 */
export class PhysicsWorld {
  bodies: PhysicsBody[] = [];
  bounds: THREETypes.Box3 | null;
  planes: THREETypes.Plane[] | null;
  lockZ: boolean;

  private maxDelta: number;
  private onWallBounce?: (body: PhysicsBody) => void;
  private onBodyCollision?: (a: PhysicsBody, b: PhysicsBody) => void;

  constructor({
    bounds,
    planes,
    lockZ = false,
    maxDelta = DEFAULT_MAX_DELTA,
    onWallBounce,
    onBodyCollision,
  }: PhysicsWorldOptions = {}) {
    this.bounds = bounds ?? null;
    this.planes = planes ?? null;
    this.lockZ = lockZ;
    this.maxDelta = maxDelta;
    this.onWallBounce = onWallBounce;
    this.onBodyCollision = onBodyCollision;
  }

  add(options: PhysicsBodyOptions | PhysicsBody): PhysicsBody {
    const body = options instanceof PhysicsBody ? options : new PhysicsBody(options);
    this.bodies.push(body);
    return body;
  }

  remove(body: PhysicsBody) {
    const index = this.bodies.indexOf(body);
    if (index !== -1) this.bodies.splice(index, 1);
  }

  setBounds(bounds: THREETypes.Box3) {
    this.bounds = bounds;
  }

  setPlanes(planes: THREETypes.Plane[]) {
    this.planes = planes;
  }

  /** Advance the simulation. `delta` in seconds (e.g. `RAF.delta`). */
  step(delta: number) {
    const dt = Math.min(delta, this.maxDelta);
    if (dt <= 0) return;

    _quat.current ??= new THREE.Quaternion();
    _axis.current ??= new THREE.Vector3();

    for (const body of this.bodies) {
      if (this.lockZ) body.velocity.z = 0;

      // Integrate drift + spin.
      body.object.position.addScaledVector(body.velocity, dt);

      const spin = body.angularVelocity.length();
      if (spin > 0) {
        _axis.current.copy(body.angularVelocity).divideScalar(spin);
        _quat.current.setFromAxisAngle(_axis.current, spin * dt);
        body.object.quaternion.premultiply(_quat.current);
      }

      // Rotation changes the world silhouette, so the collider must refresh
      // before wall tests — a spinning body can hit a wall without moving.
      body.updateWorldAABB();

      let bounced = false;
      if (this.bounds) bounced = this.resolveWalls(body) || bounced;
      if (this.planes) bounced = this.resolvePlanes(body) || bounced;
      if (bounced) this.onWallBounce?.(body);
    }

    this.resolveBodyPairs();
  }

  /** Reflect velocity and clamp position back inside — a large step can't leave a body stuck outside. */
  private resolveWalls(body: PhysicsBody): boolean {
    const bounds = this.bounds!;
    let bounced = false;
    const axes = this.lockZ ? AXES_2D : AXES_3D;

    for (const axis of axes) {
      const minOverlap = bounds.min[axis] - body.worldAABB.min[axis];
      if (minOverlap > 0) {
        body.translate(axis === "x" ? minOverlap : 0, axis === "y" ? minOverlap : 0, axis === "z" ? minOverlap : 0);
        if (body.velocity[axis] < 0) {
          body.velocity[axis] = -body.velocity[axis] * body.restitution;
          bounced = true;
        }
        continue;
      }

      const maxOverlap = body.worldAABB.max[axis] - bounds.max[axis];
      if (maxOverlap > 0) {
        body.translate(axis === "x" ? -maxOverlap : 0, axis === "y" ? -maxOverlap : 0, axis === "z" ? -maxOverlap : 0);
        if (body.velocity[axis] > 0) {
          body.velocity[axis] = -body.velocity[axis] * body.restitution;
          bounced = true;
        }
      }
    }

    return bounced;
  }

  /**
   * Exact plane walls: find the body's deepest vertex behind each plane, push
   * the body back inside along the plane normal, and mirror the velocity
   * component into the plane (elastic reflection scaled by restitution).
   *
   * With `lockZ`, the normal is projected into xy so a perspective frustum
   * still produces exact screen-edge contact without injecting z motion.
   */
  private resolvePlanes(body: PhysicsBody): boolean {
    const points = body.worldPoints;
    if (points.length === 0) return false;

    let bounced = false;

    for (const plane of this.planes!) {
      const { x: nx, y: ny, z: nz } = plane.normal;
      const { constant } = plane;

      let minDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < points.length; i += 3) {
        const distance = nx * points[i]! + ny * points[i + 1]! + nz * points[i + 2]! + constant;
        if (distance < minDistance) minDistance = distance;
      }
      if (minDistance >= 0) continue;

      if (this.lockZ) {
        const xyLength = Math.hypot(nx, ny);
        if (xyLength < PLANE_XY_EPSILON) continue;
        // Depth along the projected normal that restores plane contact:
        // newDist = minDistance + d · (n · n2d) → d = -minDistance / (n · n2d).
        const nDotN2d = (nx * nx + ny * ny) / xyLength;
        const depth = -minDistance / nDotN2d;
        const n2x = nx / xyLength;
        const n2y = ny / xyLength;
        body.translate(n2x * depth, n2y * depth, 0);

        const approaching = body.velocity.x * n2x + body.velocity.y * n2y;
        if (approaching < 0) {
          const impulse = (1 + body.restitution) * approaching;
          body.velocity.x -= impulse * n2x;
          body.velocity.y -= impulse * n2y;
          bounced = true;
        }
        continue;
      }

      body.translate(-minDistance * nx, -minDistance * ny, -minDistance * nz);

      const approaching = body.velocity.x * nx + body.velocity.y * ny + body.velocity.z * nz;
      if (approaching < 0) {
        const impulse = (1 + body.restitution) * approaching;
        body.velocity.x -= impulse * nx;
        body.velocity.y -= impulse * ny;
        body.velocity.z -= impulse * nz;
        bounced = true;
      }
    }

    return bounced;
  }

  /** Equal-mass elastic response along the minimum-penetration axis. */
  private resolveBodyPairs() {
    const { bodies } = this;

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        if (!a.worldAABB.intersectsBox(b.worldAABB)) continue;

        if (this.lockZ && a.worldPoints.length > 0 && b.worldPoints.length > 0) {
          this.resolveBodyPair2D(a, b);
          continue;
        }

        // Overlap per axis; separate along the smallest. Skip z when locked
        // so a pair never reflects off an invisible depth wall.
        const axes = this.lockZ ? AXES_2D : AXES_3D;
        let separationAxis: (typeof axes)[number] = "x";
        let minOverlap = Number.POSITIVE_INFINITY;
        for (const axis of axes) {
          const overlap =
            Math.min(a.worldAABB.max[axis], b.worldAABB.max[axis]) -
            Math.max(a.worldAABB.min[axis], b.worldAABB.min[axis]);
          if (overlap < minOverlap) {
            minOverlap = overlap;
            separationAxis = axis;
          }
        }
        if (minOverlap <= 0) continue;

        const aCenter = (a.worldAABB.min[separationAxis] + a.worldAABB.max[separationAxis]) / 2;
        const bCenter = (b.worldAABB.min[separationAxis] + b.worldAABB.max[separationAxis]) / 2;
        const direction = aCenter <= bCenter ? -1 : 1; // pushes `a` this way
        const push = (direction * minOverlap) / 2;

        a.translate(separationAxis === "x" ? push : 0, separationAxis === "y" ? push : 0, separationAxis === "z" ? push : 0);
        b.translate(separationAxis === "x" ? -push : 0, separationAxis === "y" ? -push : 0, separationAxis === "z" ? -push : 0);

        // Swap axis velocities only when the pair is approaching, so a
        // just-resolved contact can't re-trigger while they separate.
        const relativeVelocity = a.velocity[separationAxis] - b.velocity[separationAxis];
        const approaching = relativeVelocity * direction < 0;
        if (approaching) {
          const restitution = (a.restitution + b.restitution) / 2;
          const aVel = a.velocity[separationAxis];
          a.velocity[separationAxis] = b.velocity[separationAxis] * restitution;
          b.velocity[separationAxis] = aVel * restitution;
          this.onBodyCollision?.(a, b);
        }
      }
    }
  }

  private resolveBodyPair2D(a: PhysicsBody, b: PhysicsBody) {
    const hullA = buildConvexHull2D(a.worldPoints);
    const hullB = buildConvexHull2D(b.worldPoints);
    if (hullA.length < 2 || hullB.length < 2) return;

    let nx = 0;
    let ny = 0;
    let minDepth = Number.POSITIVE_INFINITY;

    const testAxes = (axisHull: number[], axisPoints: Float32Array) => {
      for (let i = 0; i < axisHull.length; i++) {
        const current = axisHull[i]!;
        const next = axisHull[(i + 1) % axisHull.length]!;
        const edgeX = axisPoints[next * 3]! - axisPoints[current * 3]!;
        const edgeY = axisPoints[next * 3 + 1]! - axisPoints[current * 3 + 1]!;
        const axisLength = Math.hypot(edgeX, edgeY);
        if (axisLength === 0) continue;

        let axisX = -edgeY / axisLength;
        let axisY = edgeX / axisLength;
        let minA = Number.POSITIVE_INFINITY;
        let maxA = Number.NEGATIVE_INFINITY;
        let minB = Number.POSITIVE_INFINITY;
        let maxB = Number.NEGATIVE_INFINITY;

        for (const index of hullA) {
          const projection = a.worldPoints[index * 3]! * axisX + a.worldPoints[index * 3 + 1]! * axisY;
          minA = Math.min(minA, projection);
          maxA = Math.max(maxA, projection);
        }
        for (const index of hullB) {
          const projection = b.worldPoints[index * 3]! * axisX + b.worldPoints[index * 3 + 1]! * axisY;
          minB = Math.min(minB, projection);
          maxB = Math.max(maxB, projection);
        }

        if (maxA <= minB || maxB <= minA) return false;

        const positiveDepth = maxA - minB;
        const negativeDepth = maxB - minA;
        let depth = positiveDepth;
        if (negativeDepth < positiveDepth) {
          axisX = -axisX;
          axisY = -axisY;
          depth = negativeDepth;
        }

        if (depth < minDepth) {
          minDepth = depth;
          nx = axisX;
          ny = axisY;
        }
      }
      return true;
    };

    if (!testAxes(hullA, a.worldPoints) || !testAxes(hullB, b.worldPoints)) return;

    const pushX = (nx * minDepth) / 2;
    const pushY = (ny * minDepth) / 2;
    a.translate(-pushX, -pushY, 0);
    b.translate(pushX, pushY, 0);

    const relativeSpeed = (a.velocity.x - b.velocity.x) * nx + (a.velocity.y - b.velocity.y) * ny;
    if (relativeSpeed <= 0) return;

    const restitution = (a.restitution + b.restitution) / 2;
    const impulse = ((1 + restitution) * relativeSpeed) / 2;
    a.velocity.x -= impulse * nx;
    a.velocity.y -= impulse * ny;
    b.velocity.x += impulse * nx;
    b.velocity.y += impulse * ny;
    this.onBodyCollision?.(a, b);
  }
}
