import type { DebugContext } from "../../core/debugHelpers";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";

export type NavigationPluginOptions = {
  maxAgents?: number;
  maxAgentRadius?: number;
};

export class NavigationPlugin implements ISanweiPlugin {
  readonly name = "ai-navigation";

  navMesh: any = null;
  query: any = null;
  crowd: any = null;
  helper: any = null;

  private recast: any = null;
  private recastThree: any = null;
  private unsub: (() => void) | null = null;
  private options: NavigationPluginOptions;

  constructor(options: NavigationPluginOptions = {}) {
    this.options = options;
  }

  async install(app: SanweiApp) {
    try {
      this.recast = await import("@recast-navigation/core");
      this.recastThree = await import("@recast-navigation/three");
    } catch {
      throw new Error(
        'NavigationPlugin requires optional peers "@recast-navigation/core" and "@recast-navigation/three".'
      );
    }
    await this.recast.init();

    this.unsub = app.ticker.on((ticker) => {
      this.crowd?.update(ticker.deltaScaled);
    }, TICK_ORDER.AI);
  }

  /** Bake a solo navmesh from Three.js meshes and create a crowd. */
  bake(meshes: any[], config?: Record<string, unknown>) {
    const result = this.recastThree.threeToSoloNavMesh(meshes, config);
    if (!result?.success) {
      throw new Error("Navmesh generation failed");
    }
    this.navMesh?.destroy?.();
    this.query?.destroy?.();
    this.crowd?.destroy?.();
    this.navMesh = result.navMesh;
    this.query = new this.recast.NavMeshQuery(this.navMesh);
    this.crowd = new this.recast.Crowd(this.navMesh, {
      maxAgents: this.options.maxAgents ?? 32,
      maxAgentRadius: this.options.maxAgentRadius ?? 0.6,
    });
    return this.navMesh;
  }

  addAgent(position: { x: number; y: number; z: number }, params?: Record<string, unknown>) {
    if (!this.crowd) throw new Error("Call bake() before addAgent()");
    return this.crowd.addAgent(position, {
      radius: 0.4,
      height: 1.8,
      maxAcceleration: 8,
      maxSpeed: 2.5,
      ...params,
    });
  }

  requestMove(agentIndex: number, position: { x: number; y: number; z: number }) {
    this.crowd?.requestMoveTarget(agentIndex, position);
  }

  getAgentPosition(agentIndex: number) {
    return this.crowd?.getAgentPosition(agentIndex);
  }

  showHelper(scene: any) {
    if (!this.navMesh || !this.recastThree) return null;
    this.helper = new this.recastThree.NavMeshHelper({ navMesh: this.navMesh });
    scene.add(this.helper.mesh);
    return this.helper;
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "AI Navigation", expanded: false });
    folder.addBinding(this.options, "maxAgents", { min: 1, max: 256, step: 1, readonly: true });
  }

  dispose() {
    this.unsub?.();
    this.unsub = null;
    this.helper?.mesh?.removeFromParent();
    this.crowd?.destroy?.();
    this.query?.destroy?.();
    this.navMesh?.destroy?.();
  }
}
