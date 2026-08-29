declare module "@recast-navigation/core" {
  export function init(): Promise<void>;
  export class NavMesh {
    destroy(): void;
  }
  export class NavMeshQuery {
    constructor(navMesh: NavMesh);
    findClosestPoint(position: { x: number; y: number; z: number }, options?: any): any;
    computePath(start: any, end: any, options?: any): any;
    destroy(): void;
  }
  export class Crowd {
    constructor(navMesh: NavMesh, options?: any);
    addAgent(position: { x: number; y: number; z: number }, params?: any): number;
    removeAgent(index: number): void;
    getAgent(index: number): any;
    getAgentPosition(index: number): { x: number; y: number; z: number };
    getAgentVelocity(index: number): { x: number; y: number; z: number };
    requestMoveTarget(index: number, position: { x: number; y: number; z: number }): void;
    update(delta: number): void;
    destroy(): void;
  }
}

declare module "@recast-navigation/three" {
  export function threeToSoloNavMesh(meshes: any[], config?: any): { success: boolean; navMesh: any };
  export function threeToTiledNavMesh(meshes: any[], config?: any): { success: boolean; navMesh: any };
  export class NavMeshHelper {
    constructor(options: any);
    mesh: any;
    update(): void;
  }
}
