class PhysicsClass {
  isSingleton = true;

  async init() {
    const RAPIER = await import("@dimforge/rapier3d");

    this.rapier = RAPIER;

    return;

    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    const world = new RAPIER.World(gravity);

    // Create the ground
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0);
    world.createCollider(groundColliderDesc);

    // Create a dynamic rigid-body.
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0.0, 1.0, 0.0);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Create a cuboid collider attached to the dynamic rigidBody.
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    const _collider = world.createCollider(colliderDesc, rigidBody);

    // Game loop. Replace by your own game loop system.
    const gameLoop = () => {
      // Step the simulation forward.
      world.step();

      // Get and print the rigid-body's position.
      const position = rigidBody.translation();
      console.log("Rigid-body position: ", position.x, position.y);

      setTimeout(gameLoop, 16);
    };

    gameLoop();
  }
}

export const Physics = new PhysicsClass();
