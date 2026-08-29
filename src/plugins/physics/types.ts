export type Vec3Like = { x: number; y: number; z: number };
export type QuatLike = { x: number; y: number; z: number; w: number };

export type PhysicsBodyType = "dynamic" | "fixed" | "kinematicPositionBased" | "kinematicVelocityBased";

export type ColliderShape =
  | "cuboid"
  | "ball"
  | "cylinder"
  | "trimesh"
  | "hull"
  | "heightfield"
  | "capsule";

export type ColliderDescription = {
  shape: ColliderShape;
  parameters: any[];
  position?: Vec3Like;
  quaternion?: QuatLike;
  mass?: number;
  friction?: number;
  restitution?: number;
  category?: string;
  centerOfMass?: Vec3Like;
};

export type PhysicalDescription = {
  type?: PhysicsBodyType;
  position?: Vec3Like;
  rotation?: QuatLike;
  canSleep?: boolean;
  sleeping?: boolean;
  enabled?: boolean;
  linearDamping?: number;
  angularDamping?: number;
  mass?: number;
  friction?: number;
  frictionRule?: "average" | "min" | "max" | "multiply";
  restitution?: number;
  category?: string;
  contactThreshold?: number;
  onCollision?: (force: number, position: Vec3Like) => void;
  colliders: ColliderDescription[];
  collidersOverwrite?: Partial<ColliderDescription>;
};

export type PhysicsObject = {
  visual: { object3D: any; parent: any } | null;
  physical: Physical | null;
  needsUpdate: boolean;
  resetting: boolean;
};

export type Physical = {
  type: PhysicsBodyType;
  body: any;
  colliders: any[];
  linearDamping: number;
  angularDamping: number;
  onCollision?: (force: number, position: Vec3Like) => void;
  initialState: {
    position: Vec3Like;
    rotation: QuatLike;
    sleeping: boolean;
  };
};
