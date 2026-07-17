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

Import from the renderer-specific entry point so `THREE` is bound correctly:

```ts
// WebGL
import { Manager, CameraManager, THREE } from "@nightmarket/sanwei/three";

// WebGPU
import { Manager, CameraManager, THREE } from "@nightmarket/sanwei/three-webgpu";
```

Core utilities that do not depend on a THREE binding:

```ts
import { Debug, Input, RAF, UIEmitter } from "@nightmarket/sanwei";
```

### Debug

`IS_DEBUG` is `true` when `NEXT_PUBLIC_IS_DEBUG=true` (Next.js convention). Wire the debug pane through `Manager.init`:

```ts
import { Debug } from "@nightmarket/sanwei";
import { Manager } from "@nightmarket/sanwei/three";

await Manager.init({
  canvas,
  renderer,
  initDebug: async () => {
    await Debug.init();
    return {
      debug: Debug,
      pane: Debug.pane!,
      inspectorPane: Debug.inspectorPane,
      tunePane: Debug.inspectorPane,
    };
  },
});
```

### Other entry points

| Export | Description |
| --- | --- |
| `@nightmarket/sanwei/constants` | Shared constants (`IS_DEBUG`, pass types, …) |
| `@nightmarket/sanwei/debug` | `DebugContext` helper types |
| `@nightmarket/sanwei/debug-runtime` | `Debug` singleton (same as root `Debug`) |
| `@nightmarket/sanwei/util/*` | Utilities (`camera`, `viewport`, `bindings`, …) |
| `@nightmarket/sanwei/extras/*` | Optional extras (`Physics`, `Synth`, `ScreenQuad`, …) |

This package ships TypeScript source and is meant to be consumed by a bundler (Vite, Next.js, etc.). GLTF Draco/Basis paths in `AssetManager` are relative to the app (`./libs/draco/`, `./libs/basis/`).

## License

MIT
