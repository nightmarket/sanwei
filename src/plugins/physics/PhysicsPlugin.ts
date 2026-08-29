import type { DebugContext } from "../../core/debugHelpers";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";
import { InstancedGroup } from "./InstancedGroup";
import { PhysicsWireframe } from "./PhysicsWireframe";
import type { Physical, PhysicalDescription, PhysicsObject, Vec3Like } from "./types";

export type PhysicsPluginOptions = {
  gravity?: Vec3Like;
  scene?: any;
};

export class PhysicsPlugin implements ISanweiPlugin {
  readonly name = "physics";

  RAPIER: any;
  world: any;
  eventQueue: any;
  objects = new Map<number, PhysicsObject>();
  physicals: Physical[] = [];
  groups = {
    all: 0b0000000000000001,
    object: 0b0000000000000010,
    bumper: 0b0000000000000100,
  };
  categories: Record<string, number> = {};
  wireframe: PhysicsWireframe | null = null;

  private app: SanweiApp | null = null;
  private nextKey = 0;
  private unsubs: Array<() => void> = [];
  private gravity: Vec3Like;
  private scene: any;

  constructor(private options: PhysicsPluginOptions = {}) {
    this.gravity = options.gravity ?? { x: 0, y: -9.81, z: 0 };
    this.scene = options.scene;
  }

  async install(app: SanweiApp) {
    this.app = app;
    this.RAPIER = await import("@dimforge/rapier3d");
    this.world = new this.RAPIER.World(this.gravity);
    this.eventQueue = new this.RAPIER.EventQueue(true);
    this.categories = {
      floor: (this.groups.all << 16) | this.groups.all,
      object: ((this.groups.all | this.groups.object) << 16) | (this.groups.all | this.groups.bumper),
      bumper: (this.groups.bumper << 16) | this.groups.object,
    };
    this.scene = this.options.scene ?? null;

    this.unsubs.push(
      app.ticker.on(() => {
        this.step();
      }, TICK_ORDER.PHYSICS_STEP)
    );
    this.unsubs.push(
      app.ticker.on(() => {
        this.sync();
      }, TICK_ORDER.PHYSICS_SYNC)
    );
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "Physics", expanded: false });
    folder.addBinding(this.world.gravity, "y", { min: -20, max: 20, step: 0.01 });
    this.wireframe = new PhysicsWireframe(this.world, this.getScene());
    folder.addBinding(this.wireframe, "active").on("change", () => this.wireframe?.syncScene());
    this.unsubs.push(
      this.app!.ticker.on(() => {
        this.wireframe?.update();
      }, TICK_ORDER.PHYSICS_SYNC)
    );
  }

  createPhysical(description: PhysicalDescription): Physical {
    const RAPIER = this.RAPIER;
    const type = description.type ?? "dynamic";
    let desc = RAPIER.RigidBodyDesc;
    if (type === "fixed") desc = desc.fixed();
    else if (type === "kinematicPositionBased") desc = desc.kinematicPositionBased();
    else if (type === "kinematicVelocityBased") desc = desc.kinematicVelocityBased();
    else desc = desc.dynamic();

    if (description.position) {
      desc.setTranslation(description.position.x, description.position.y, description.position.z);
    }
    if (description.rotation) desc.setRotation(description.rotation);
    if (description.canSleep !== undefined) desc.setCanSleep(description.canSleep);
    const linearDamping = description.linearDamping ?? 0.1;
    const angularDamping = description.angularDamping ?? 0.1;
    desc.setLinearDamping(linearDamping);
    desc.setAngularDamping(angularDamping);
    if (description.sleeping !== undefined) desc.setSleeping(description.sleeping);
    if (description.enabled !== undefined) desc.setEnabled(description.enabled);

    const body = this.world.createRigidBody(desc);
    const physical: Physical = {
      type,
      body,
      colliders: [],
      linearDamping,
      angularDamping,
      onCollision: description.onCollision,
      initialState: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        sleeping: false,
      },
    };

    const overwrite = description.collidersOverwrite ?? {};
    for (const raw of description.colliders) {
      const colliderDesc = { ...raw, ...overwrite };
      let collider = createColliderDesc(RAPIER, colliderDesc);
      if (!collider) continue;
      if (colliderDesc.position) {
        collider = collider.setTranslation(
          colliderDesc.position.x,
          colliderDesc.position.y,
          colliderDesc.position.z
        );
      }
      if (colliderDesc.quaternion) collider = collider.setRotation(colliderDesc.quaternion);
      collider = collider.setDensity(0.1);
      if (colliderDesc.mass !== undefined) collider = collider.setMass(colliderDesc.mass);
      else if (description.mass !== undefined) {
        collider = collider.setMass(description.mass / description.colliders.length);
      }
      collider = collider.setFriction(description.friction ?? colliderDesc.friction ?? 0.2);
      if (description.frictionRule) {
        collider = collider.setFrictionCombineRule(RAPIER.CoefficientCombineRule[capitalize(description.frictionRule)]);
      }
      collider = collider.setRestitution(description.restitution ?? colliderDesc.restitution ?? 0.15);
      const category = description.category ?? colliderDesc.category ?? "object";
      collider = collider.setCollisionGroups(this.categories[category] ?? this.categories.object);

      if (description.onCollision || description.contactThreshold !== undefined) {
        collider = collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
        collider = collider.setContactForceEventThreshold(description.contactThreshold ?? 15);
      }

      physical.colliders.push(this.world.createCollider(collider, body));
    }

    const translation = body.translation();
    physical.initialState = {
      position: { x: translation.x, y: translation.y, z: translation.z },
      rotation: body.rotation(),
      sleeping: body.isSleeping(),
    };
    this.physicals.push(physical);
    return physical;
  }

  add(visual?: { model: any; parent?: any } | null, physical?: PhysicalDescription | null): PhysicsObject {
    const object: PhysicsObject = {
      visual: null,
      physical: null,
      needsUpdate: false,
      resetting: false,
    };

    if (visual?.model) {
      const parent = visual.parent ?? this.getScene();
      if (parent) parent.add(visual.model);
      object.visual = { object3D: visual.model, parent };
    }
    if (physical) object.physical = this.createPhysical(physical);

    if (object.physical) object.physical.body.userData = { object };
    if (object.visual) object.visual.object3D.userData.object = object;

    this.nextKey += 1;
    this.objects.set(this.nextKey, object);

    if (
      object.visual &&
      object.physical &&
      (physical?.sleeping || physical?.enabled === false || object.physical.type === "fixed")
    ) {
      object.visual.object3D.position.copy(object.physical.body.translation());
      object.visual.object3D.quaternion.copy(object.physical.body.rotation());
    }

    return object;
  }

  reset(object: PhysicsObject) {
    if (!object.physical || object.resetting) return;
    if (object.physical.type !== "dynamic" && object.physical.type !== "kinematicPositionBased") return;

    object.resetting = true;
    const body = object.physical.body;
    const enabled = body.isEnabled();
    body.setEnabled(false);
    body.setTranslation(object.physical.initialState.position, false);
    body.setRotation(object.physical.initialState.rotation, false);
    body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    body.resetForces?.();
    body.resetTorques?.();

    this.app?.ticker.wait(1, () => {
      body.setEnabled(enabled);
      if (object.physical?.initialState.sleeping) body.sleep();
      object.resetting = false;
      this.app?.ticker.wait(1, () => {
        object.needsUpdate = true;
      });
    });

    if (object.visual) {
      object.visual.object3D.position.copy(object.physical.initialState.position);
      object.visual.object3D.quaternion.copy(object.physical.initialState.rotation);
    }
  }

  resetAll() {
    this.objects.forEach((object) => this.reset(object));
  }

  getScene() {
    if (!this.scene && this.app) {
      this.scene = this.options.scene ?? this.app.scenes.scenes[this.app.scenes.activeSceneIndex]?.scene ?? null;
    }
    return this.scene;
  }

  createInstancedGroup(references: any[], group: any, autoUpdate = true) {
    const instanced = new InstancedGroup(references, group, this.getScene());
    if (autoUpdate) {
      this.unsubs.push(
        this.app!.ticker.on(() => {
          instanced.update();
        }, TICK_ORDER.INSTANCED)
      );
    }
    return instanced;
  }

  private step() {
    if (!this.app) return;
    this.world.timestep = this.app.ticker.deltaScaled;
    this.world.step(this.eventQueue);
    this.eventQueue.drainContactForceEvents((event: any) => {
      const collider1 = this.world.getCollider(event.collider1());
      const collider2 = this.world.getCollider(event.collider2());
      const body1 = collider1.parent();
      const body2 = collider2.parent();
      const callback1 = body1.userData?.object?.physical?.onCollision;
      const callback2 = body2.userData?.object?.physical?.onCollision;
      if (typeof callback1 !== "function" && typeof callback2 !== "function") return;
      const force = event.maxForceMagnitude() / (body1.mass() + body2.mass());
      const position1 = body1.translation();
      const position2 = body2.translation();
      const position =
        position1.x === 0 && position1.y === 0 && position1.z === 0 ? position2 : position1;
      callback1?.(force, position);
      callback2?.(force, position);
    });
  }

  private sync() {
    this.objects.forEach((object) => {
      if (!object.visual || !object.physical) return;
      const body = object.physical.body;
      if (object.needsUpdate || (!body.isSleeping() && body.isEnabled())) {
        object.needsUpdate = false;
        object.visual.object3D.position.copy(body.translation());
        object.visual.object3D.quaternion.copy(body.rotation());
      }
    });
  }

  dispose() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.wireframe?.dispose();
    this.world?.free?.();
    this.app = null;
  }
}

function capitalize(value: string) {
  return value[0]!.toUpperCase() + value.slice(1);
}

function createColliderDesc(RAPIER: any, description: { shape: string; parameters: any[] }) {
  const { shape, parameters } = description;
  if (shape === "cuboid") return RAPIER.ColliderDesc.cuboid(...parameters);
  if (shape === "ball") return RAPIER.ColliderDesc.ball(...parameters);
  if (shape === "cylinder") return RAPIER.ColliderDesc.cylinder(...parameters);
  if (shape === "capsule") return RAPIER.ColliderDesc.capsule(...parameters);
  if (shape === "trimesh") return RAPIER.ColliderDesc.trimesh(...parameters);
  if (shape === "hull") return RAPIER.ColliderDesc.convexHull(...parameters);
  if (shape === "heightfield") return RAPIER.ColliderDesc.heightfield(...parameters);
  return null;
}
