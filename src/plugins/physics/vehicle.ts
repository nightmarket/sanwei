import * as THREE from "three/webgpu";
import { TICK_ORDER } from "../../core/tick";
import type { SanweiApp } from "../../core/SanweiApp";
import { PhysicsPlugin } from "./PhysicsPlugin";
import type { Physical, PhysicalDescription } from "./types";

export type VehicleWheelConfig = {
  position: THREE.Vector3;
  radius: number;
  suspensionRestLength?: number;
  suspensionStiffness?: number;
};

export type PhysicsVehicleOptions = {
  chassis: Physical | PhysicalDescription;
  wheels: VehicleWheelConfig[];
  steeringAmplitude?: number;
  engineForce?: number;
  boostMultiplier?: number;
  topSpeed?: number;
  brakeAmplitude?: number;
};

export type VehicleInput = {
  steer: number;
  engine: number;
  brake: number;
  boost: boolean;
};

/** Rapier vehicle controller. Chassis + wheels; input is supplied each tick. */
export class PhysicsVehicle {
  chassis: Physical;
  controller: any;
  position = new THREE.Vector3();
  quaternion = new THREE.Quaternion();
  velocity = new THREE.Vector3();
  speed = 0;
  input: VehicleInput = { steer: 0, engine: 0, brake: 0, boost: false };

  steeringAmplitude: number;
  engineForce: number;
  boostMultiplier: number;
  topSpeed: number;
  brakeAmplitude: number;

  private unsubs: Array<() => void> = [];
  private physics: PhysicsPlugin;

  constructor(app: SanweiApp, options: PhysicsVehicleOptions) {
    this.physics = app.plugin(PhysicsPlugin);
    this.chassis =
      "body" in options.chassis ? options.chassis : this.physics.createPhysical(options.chassis);
    this.controller = this.physics.world.createVehicleController(this.chassis.body);

    this.steeringAmplitude = options.steeringAmplitude ?? 0.5;
    this.engineForce = options.engineForce ?? 300;
    this.boostMultiplier = options.boostMultiplier ?? 2;
    this.topSpeed = options.topSpeed ?? 12;
    this.brakeAmplitude = options.brakeAmplitude ?? 35;

    options.wheels.forEach((wheel, index) => {
      this.controller.addWheel(wheel.position, new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), 0.4, wheel.radius);
      this.controller.setWheelSuspensionRestLength(index, wheel.suspensionRestLength ?? 0.2);
      this.controller.setWheelSuspensionStiffness(index, wheel.suspensionStiffness ?? 30);
    });

    this.unsubs.push(
      app.ticker.on(() => {
        this.updatePrePhysics();
      }, TICK_ORDER.PHYSICS_PRE)
    );
    this.unsubs.push(
      app.ticker.on(() => {
        this.updatePostPhysics();
      }, TICK_ORDER.PHYSICS_POST)
    );
  }

  updatePrePhysics() {
    const boost = this.input.boost ? this.boostMultiplier : 1;
    const force = this.input.engine * this.engineForce * boost;
    const steer = this.input.steer * this.steeringAmplitude;
    const wheels = this.controller.numWheels?.() ?? 4;
    for (let i = 0; i < wheels; i++) {
      const front = i < 2;
      this.controller.setWheelSteering(i, front ? steer : 0);
      this.controller.setWheelEngineForce(i, front ? 0 : force);
      this.controller.setWheelBrake(i, this.input.brake * this.brakeAmplitude);
    }
    this.controller.updateVehicle(this.physics.world.timestep ?? 1 / 60);
  }

  updatePostPhysics() {
    const translation = this.chassis.body.translation();
    this.position.set(translation.x, translation.y, translation.z);
    const rotation = this.chassis.body.rotation();
    this.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const linvel = this.chassis.body.linvel();
    this.velocity.set(linvel.x, linvel.y, linvel.z);
    this.speed = this.velocity.length();
    if (this.speed > this.topSpeed * (this.input.boost ? this.boostMultiplier : 1)) {
      this.velocity.multiplyScalar(
        (this.topSpeed * (this.input.boost ? this.boostMultiplier : 1)) / this.speed
      );
      this.chassis.body.setLinvel(this.velocity, true);
    }
  }

  dispose() {
    for (const unsub of this.unsubs) unsub();
  }
}
