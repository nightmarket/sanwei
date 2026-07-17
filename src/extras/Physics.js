class PhysicsClass {
  isSingleton = true;

  /** Loads Rapier and exposes it as `this.rapier`. World setup is left to the app. */
  async init() {
    const RAPIER = await import("@dimforge/rapier3d");
    this.rapier = RAPIER;
  }
}

export const Physics = new PhysicsClass();
