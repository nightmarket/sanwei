export type Vec3 = { x: number; y: number; z: number };

function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  return set(out, a.x - b.x, a.y - b.y, a.z - b.z);
}

function length(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(out: Vec3, v: Vec3): Vec3 {
  const len = length(v) || 1;
  return set(out, v.x / len, v.y / len, v.z / len);
}

function scale(out: Vec3, v: Vec3, s: number): Vec3 {
  return set(out, v.x * s, v.y * s, v.z * s);
}

const _delta: Vec3 = { x: 0, y: 0, z: 0 };

export function seek(out: Vec3, position: Vec3, target: Vec3, maxSpeed: number) {
  sub(_delta, target, position);
  normalize(_delta, _delta);
  return scale(out, _delta, maxSpeed);
}

export function flee(out: Vec3, position: Vec3, target: Vec3, maxSpeed: number) {
  seek(out, target, position, maxSpeed);
  return out;
}

export function arrive(out: Vec3, position: Vec3, target: Vec3, maxSpeed: number, slowingRadius: number) {
  sub(_delta, target, position);
  const distance = length(_delta);
  const speed = distance < slowingRadius ? maxSpeed * (distance / slowingRadius) : maxSpeed;
  if (distance === 0) return set(out, 0, 0, 0);
  return scale(out, _delta, speed / distance);
}

export function wander(
  out: Vec3,
  velocity: Vec3,
  state: { angle: number },
  distance = 4,
  radius = 2,
  jitter = 0.4
) {
  state.angle += (Math.random() - 0.5) * jitter;
  normalize(_delta, velocity);
  const centerX = _delta.x * distance;
  const centerZ = _delta.z * distance;
  return set(out, centerX + Math.cos(state.angle) * radius, 0, centerZ + Math.sin(state.angle) * radius);
}

export function followPath(out: Vec3, position: Vec3, path: Vec3[], lookahead = 2, maxSpeed = 2) {
  if (path.length < 2) return set(out, 0, 0, 0);
  let nearest = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i]!.x - position.x, path[i]!.z - position.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = i;
    }
  }
  const target = path[Math.min(nearest + lookahead, path.length - 1)]!;
  return seek(out, position, target, maxSpeed);
}

export function separation(out: Vec3, position: Vec3, neighbors: Vec3[], radius: number) {
  set(out, 0, 0, 0);
  let count = 0;
  for (const other of neighbors) {
    sub(_delta, position, other);
    const d = length(_delta);
    if (d > 0 && d < radius) {
      out.x += _delta.x / d;
      out.z += _delta.z / d;
      count += 1;
    }
  }
  if (count > 0) {
    out.x /= count;
    out.z /= count;
  }
  return out;
}

export function alignment(out: Vec3, velocities: Vec3[]) {
  set(out, 0, 0, 0);
  if (velocities.length === 0) return out;
  for (const velocity of velocities) {
    out.x += velocity.x;
    out.y += velocity.y;
    out.z += velocity.z;
  }
  return scale(out, out, 1 / velocities.length);
}

export function cohesion(out: Vec3, position: Vec3, neighbors: Vec3[], maxSpeed: number) {
  set(_delta, 0, 0, 0);
  if (neighbors.length === 0) return set(out, 0, 0, 0);
  for (const other of neighbors) {
    _delta.x += other.x;
    _delta.y += other.y;
    _delta.z += other.z;
  }
  scale(_delta, _delta, 1 / neighbors.length);
  return seek(out, position, _delta, maxSpeed);
}

export type Agent = {
  position: Vec3;
  velocity: Vec3;
  maxSpeed: number;
  maxForce: number;
};

export function integrate(agent: Agent, force: Vec3, delta: number) {
  agent.velocity.x += force.x * delta;
  agent.velocity.y += force.y * delta;
  agent.velocity.z += force.z * delta;
  const speed = length(agent.velocity);
  if (speed > agent.maxSpeed) scale(agent.velocity, agent.velocity, agent.maxSpeed / speed);
  agent.position.x += agent.velocity.x * delta;
  agent.position.y += agent.velocity.y * delta;
  agent.position.z += agent.velocity.z * delta;
}
