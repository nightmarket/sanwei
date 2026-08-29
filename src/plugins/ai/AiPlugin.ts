import type { DebugContext } from "../../core/debugHelpers";
import type { SanweiApp } from "../../core/SanweiApp";
import { TICK_ORDER } from "../../core/tick";
import type { ISanweiPlugin } from "../../core/types";
import { CrowdRenderer, type CrowdRendererOptions } from "./CrowdRenderer";
import { type Agent, integrate, type Vec3 } from "./steering";

export type AiPluginOptions = {
  agents?: Agent[];
  /** Called each AI tick with the plugin so the app can apply steering. */
  onUpdate?: (plugin: AiPlugin, delta: number) => void;
};

/** Optional umbrella: ticks steering agents and crowd renderers. */
export class AiPlugin implements ISanweiPlugin {
  readonly name = "ai";
  agents: Agent[] = [];
  renderers: CrowdRenderer[] = [];

  private app: SanweiApp | null = null;
  private unsub: (() => void) | null = null;
  private onUpdate?: (plugin: AiPlugin, delta: number) => void;

  constructor(options: AiPluginOptions = {}) {
    this.agents = options.agents ?? [];
    this.onUpdate = options.onUpdate;
  }

  install(app: SanweiApp) {
    this.app = app;
    this.unsub = app.ticker.on((ticker) => {
      this.onUpdate?.(this, ticker.deltaScaled);
      for (const renderer of this.renderers) {
        renderer.update(ticker.deltaScaled, app.renderer);
      }
    }, TICK_ORDER.AI);
  }

  createCrowd(options: CrowdRendererOptions) {
    const renderer = new CrowdRenderer(options);
    this.renderers.push(renderer);
    return renderer;
  }

  addAgent(agent: Agent) {
    this.agents.push(agent);
    return agent;
  }

  integrate(agent: Agent, force: Vec3, delta: number) {
    integrate(agent, force, delta);
  }

  async initDebug(context: DebugContext) {
    const folder = context.pane.addFolder({ title: "AI", expanded: false });
    folder.addBinding({ agents: this.agents.length }, "agents", { readonly: true });
  }

  dispose() {
    this.unsub?.();
    this.unsub = null;
    for (const renderer of this.renderers) renderer.dispose();
    this.renderers = [];
    this.app = null;
  }
}
