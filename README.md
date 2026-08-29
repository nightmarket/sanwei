# @nightmarket/sanwei

Three.js / WebGPU scene engine — managers, postprocessing, input, and optional debug tooling via [@nightmarket/tiao](https://www.npmjs.com/package/@nightmarket/tiao).

## Install

```bash
npm install @nightmarket/sanwei three
```

For the debug pane:

```bash
npm install @nightmarket/tiao
```

## Usage

Import from the renderer-specific entry point so `THREE` is bound correctly.

```ts
import { createSanweiApp, THREE } from "@nightmarket/sanwei/three";
import { createSanweiApp, THREE } from "@nightmarket/sanwei/three-webgpu";
```

Core utilities that do not depend on a THREE binding:

```ts
import { Input, RAF, UIEmitter } from "@nightmarket/sanwei";
```

### Debug

Debugging is enabled automatically when `NODE_ENV !== "production"` and disabled
in production. App code should not branch on an environment variable.

`Debug.init()` is agnostic: it creates a **Performance** pane (FPS / CPU / GPU / draw calls)
and lets each `SanweiApp` open its own scene pane. Apps add folders, bindings, or extra
panes on top via `setup` / `createPane()`.

The runtime facade is safe to import normally. The package export resolves to
the full lazy runtime in development and a no-op module in production, so tiao
is absent from production bundles:

```ts
import { Debug } from "@nightmarket/sanwei/debug-runtime";
import { Manager } from "@nightmarket/sanwei/three";

await Manager.init({
  canvas,
  renderer,
  initDebug: () =>
    Debug.init({
      renderer,
      setup: ({ pane }) => {
        const folder = pane.addFolder({ title: "My Controls" });
        return () => folder.dispose();
      },
    }),
});
```

Components can contribute controls before or after initialization without polling:

```ts
const dispose = Debug.setup(({ pane }) => {
  const folder = pane.addFolder({ title: "Physics" });
  // add bindings...
  return () => folder.dispose();
});
```

### Other entry points

| Export | Description |
| --- | --- |
| `@nightmarket/sanwei/constants` | Shared constants and gates (`isDebugEnabled()`, pass types, …) |
| `@nightmarket/sanwei/debug` | `DebugContext` helper types (no runtime) |
| `@nightmarket/sanwei/debug-runtime` | Development-only Debug facade |
| `@nightmarket/sanwei/util/*` | Utilities (`camera`, `viewport`, `bindings`, …) |
| `@nightmarket/sanwei/extras/*` | Optional extras (`Physics`, `Synth`, `ScreenQuad`, …) |
| `@nightmarket/sanwei/plugins/*` | Opt-in plugins (`time`, `weather`, `wind`, `sky`, `lighting`, `weather-fx`, `physics`, `ai`) |
| `@nightmarket/sanwei/plugins/ai/navigation` | Recast navmesh crowd. Optional peer. |
| `@nightmarket/sanwei/plugins/environment` | Convenience installer for the full environment stack |

### Plugins (WebGPU)

Install what a game needs. Lookup is by class or name. Visual plugins wait for a scene, so `use()` can run before `addScenes`.

```ts
import { createSanweiApp } from "@nightmarket/sanwei/three-webgpu";
import { useEnvironment } from "@nightmarket/sanwei/plugins/environment";
import { TimePlugin } from "@nightmarket/sanwei/plugins/time";

const app = await createSanweiApp({ name: "main", canvas, renderer });
await useEnvironment(app);
await app.scenes.addScenes([scene]);
app.plugin(TimePlugin).day.progress;
app.start();
```

`WeatherPlugin` depends on `time`. Rapier and recast-navigation stay optional peers.

A full loop lives in `examples/playground` (`pnpm example`). That folder is not part of the published package.

This package ships TypeScript source and is meant to be consumed by a bundler (Vite, Next.js, etc.). GLTF Draco/Basis paths in `AssetManager` are relative to the app (`./libs/draco/`, `./libs/basis/`).

## Publish

```sh
pnpm install
pnpm run publish:package
```

## License

MIT
