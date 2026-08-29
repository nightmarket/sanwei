import type { SanweiApp } from "./SanweiApp";
import type { ISanweiPlugin, SanweiPluginId, SanweiPluginInput } from "./types";

function instantiate(input: SanweiPluginInput): ISanweiPlugin {
  if (typeof input === "function") {
    return new (input as new () => ISanweiPlugin)();
  }
  return input;
}

function topoSort(plugins: ISanweiPlugin[], installed: Set<string>): ISanweiPlugin[] {
  const byName = new Map<string, ISanweiPlugin>();
  for (const plugin of plugins) {
    if (byName.has(plugin.name)) {
      throw new Error(`Duplicate plugin in batch: "${plugin.name}"`);
    }
    byName.set(plugin.name, plugin);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: ISanweiPlugin[] = [];

  const visit = (name: string) => {
    if (visited.has(name) || installed.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular plugin dependency involving "${name}"`);
    }
    const plugin = byName.get(name);
    if (!plugin) {
      throw new Error(`Plugin "${name}" is required but not provided`);
    }
    visiting.add(name);
    for (const dep of plugin.dependencies ?? []) {
      if (!installed.has(dep) && !byName.has(dep)) {
        throw new Error(`Plugin "${plugin.name}" requires "${dep}"`);
      }
      visit(dep);
    }
    visiting.delete(name);
    visited.add(name);
    ordered.push(plugin);
  };

  for (const plugin of plugins) {
    visit(plugin.name);
  }

  return ordered;
}

export class PluginManager {
  private readonly byName = new Map<string, ISanweiPlugin>();
  private readonly byCtor = new Map<Function, ISanweiPlugin>();

  constructor(private readonly app: SanweiApp) {}

  async use(...inputs: SanweiPluginInput[]): Promise<void> {
    const instances = inputs.map(instantiate).filter((plugin) => !this.byName.has(plugin.name));
    const ordered = topoSort(instances, new Set(this.byName.keys()));

    for (const plugin of ordered) {
      await plugin.install(this.app);
      if (this.app.debugContext && plugin.initDebug) {
        await plugin.initDebug(this.app.debugContext);
      }
      this.byName.set(plugin.name, plugin);
      this.byCtor.set(plugin.constructor, plugin);
    }
  }

  get<T extends ISanweiPlugin>(id: SanweiPluginId<T>): T | undefined {
    if (typeof id === "string") return this.byName.get(id) as T | undefined;
    return this.byCtor.get(id) as T | undefined;
  }

  require<T extends ISanweiPlugin>(id: SanweiPluginId<T>): T {
    const plugin = this.get(id);
    if (!plugin) {
      const label = typeof id === "string" ? id : id.name;
      throw new Error(`Plugin "${label}" is not installed`);
    }
    return plugin;
  }

  has(id: SanweiPluginId): boolean {
    return this.get(id) !== undefined;
  }

  dispose() {
    for (const plugin of [...this.byName.values()].reverse()) {
      plugin.dispose?.();
    }
    this.byName.clear();
    this.byCtor.clear();
  }
}
