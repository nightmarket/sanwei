# @nightmarket/sanwei

Three.js / WebGPU scene engine — per-canvas apps, managers, postprocessing, input, and optional debug tooling via [@nightmarket/tiao](https://www.npmjs.com/package/@nightmarket/tiao).

## Install

```bash
npm install @nightmarket/sanwei @nightmarket/tiao three
```

Requires `three >= 0.171`, where `three` and `three/webgpu` share one core build. Sanwei imports core classes straight from `three`, so they tree-shake and never duplicate across backends.

## Usage

Create apps and scenes from the renderer entry. Importing it binds that backend's uniforms:

```ts
// WebGPU (falls back to the WebGL2 backend when WebGPU is unavailable)
import { createSanweiApp, createWebGPURenderer } from "@nightmarket/sanwei/three-webgpu";
import { Vector3 } from "three/webgpu";

const renderer = await createWebGPURenderer({ canvas, alpha: true });
const app = await createSanweiApp({ name: "main", canvas, renderer, pauseWhenHidden: true });
app.cameras.addCameras([{ fov: 45, position: new Vector3(0, 0, 100) }]);
await app.scenes.addScenes([new MyScene({})]);
app.start();
```

```ts
// WebGL + EffectComposer post pipeline
import { BaseThreeScene, createSanweiApp } from "@nightmarket/sanwei/three";
```

The root entry is the renderer-agnostic runtime (`RAF`, `Mouse`, `Input`, `Device`, `AssetManager`, …). Import from it in DOM code so a component that only needs input or the ticker doesn't pull in `three/webgpu`:

```ts
import { Mouse, RAF } from "@nightmarket/sanwei";
```

### Frame loop

Every app shares one `requestAnimationFrame` loop that runs only while something is subscribed. `app.start()` / `app.stop()` subscribe the app; `pauseWhenHidden` also stops it while the canvas is offscreen or the tab is hidden. The shared per-frame work (mouse easing, `GlobalUniforms.uTime`) runs only while at least one app ticks, and WebGPURenderer's private node-frame loop is paused with its app, so an idle page schedules no frames.

### Assets

`AssetManager.loadModel(url)` loads plain glTF/GLB. Compressed assets opt into their decoders, so plain models never download them:

```ts
await AssetManager.loadModel("/model.glb", { draco: "/libs/draco/", ktx2: "/libs/basis/", renderer });
```

### Debug

Debugging follows tiao's debug level (`NEXT_PUBLIC_DEBUG_LEVEL` / `?debug`). The runtime facade is safe to import normally: the package export resolves to the full lazy runtime in development and a no-op module under the `production` condition, so tiao's pane is absent from production bundles.

`Debug.init()` creates a **Performance** pane (FPS / CPU / GPU / draw calls) and each `SanweiApp` opens its own scene pane. Apps add folders on top via `setup`:

```ts
import { Debug } from "@nightmarket/sanwei/debug-runtime";

const app = await createSanweiApp({
  name: "main",
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
  return () => folder.dispose();
});
```

### Entry points

| Export | Description |
| --- | --- |
| `@nightmarket/sanwei` | Renderer-agnostic runtime (`RAF`, `Mouse`, `Input`, `Device`, `AssetManager`, managers, constants) |
| `@nightmarket/sanwei/three` | WebGL backend: root runtime + `SanweiApp`, `BaseThreeScene`, `Post`, `TransitionController` |
| `@nightmarket/sanwei/three-webgpu` | WebGPU backend: root runtime + `SanweiApp`, `BaseThreeWebGPUScene`, `createWebGPURenderer`, `TrailEffect`, `TransitionController` |
| `@nightmarket/sanwei/physics` | Light kinematic physics for floating showpiece objects |
| `@nightmarket/sanwei/constants` | Shared constants and gates (`isDebugEnabled()`, pass types, …) |
| `@nightmarket/sanwei/debug` | `DebugContext` helper types (no runtime) |
| `@nightmarket/sanwei/debug-runtime` | Development-only Debug facade |
| `@nightmarket/sanwei/util/*` | Utilities (`camera`, `viewport`, `bindings`, …) |
| `@nightmarket/sanwei/extras/*` | Optional extras (`ScreenQuad` — WebGL render-to-texture scene; `new ScreenQuad(renderer)`) |

This package ships TypeScript source and is meant to be consumed by a bundler (Vite, Next.js with `transpilePackages`, etc.).

## Publish

```sh
pnpm install
pnpm run publish:package
```

## License

MIT
