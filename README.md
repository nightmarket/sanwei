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

```ts
const unsubscribe = RAF.subscribe((frame) => step(frame.delta), { order: RAF_ORDER.UI, fps: 30, label: "minimap" });
```

Each callback gets a `FrameState`: `time` (loop ms, excluding pauses), `timestamp` (the frame in the `performance.now()` timebase that event `timeStamp`s share), `delta` (seconds since this callback last ran, so a throttled one gets its own interval), `frames` (that span in `TUNED_FPS` = 120 Hz frames), `frame`, `interval` (ms per display refresh, as the loop measures it), `dropped` (refreshes the display waited past the frame this callback last ran in, 0 when it made its refresh) and `lerpFactor(factor)`. `delta` advances in whole refreshes, so WebKit's whole-millisecond timestamps and catch-up frames don't make steady motion step unevenly. The instance is shared, so copy it to keep values past the callback; each app does, and scenes read `this.app.frame`. Callbacks run by `order` (`RAF_ORDER`: input, scroll, scenes, UI), throttle to an absolute `fps` or a share of the display (`"50%"`), and a throwing one is logged once without stopping the loop. `RAF.pause()` / `RAF.play()` freeze everything; with the debug pane open, its perf panel graphs the loop and each callback's cost.

Per-frame tuning is for one frame at `TUNED_FPS`: scale steps by `frame.frames` and compound lerp factors with `frame.lerpFactor`. `Mouse` eases and reports `scroll.velocity` this way, and `TrailEffect.update` takes the frame count for its per-step feedback, so both read the same at any refresh rate.

### Touch scrolling

A finger moves `Mouse.scroll` by `Mouse.touchScale` scroll units per CSS px on each axis; set it so whatever is under the finger stays under it. A touch drag reads its moves a refresh behind the frame, so it steps evenly however the touches land between frames, and its fling leaves at the finger's recent speed and slows like iOS's normal deceleration.

For the platform's own scrolling, `Mouse.attachScroller(element)` hands touch scrolling to a transparent native scroller laid over the scene, many screens long on the axes it scrolls. Tracking, flings, deceleration and tap-to-stop are then the browser's, `scroll` follows the scroller's offset through `touchScale`, and the scroller goes back to mid-range whenever it settles. Call `Mouse.centerScroller()` after changing its size or axes.

### Assets

`AssetManager.loadModel(url)` loads plain glTF/GLB. Compressed assets opt into their decoders, so plain models never download them:

```ts
await AssetManager.loadModel("/model.glb", { draco: "/libs/draco/", ktx2: "/libs/basis/", renderer });
await AssetManager.loadModel("/quantized.glb", { meshopt: true }); // EXT_meshopt_compression, decoder bundled with three
await AssetManager.parseModel(bytes, { meshopt: true }); // a GLB the page already downloaded
```

### Display P3

Opt in once per app with a side-effect import, ahead of anything that creates a `Color`. Colors convert into the working color space when they're set, so ones made before the switch would read too saturated:

```ts
import "@nightmarket/sanwei/display-p3";
```

That makes linear Display P3 the working color space, and `createWebGPURenderer` uploads images as P3 (WebGPU, or WebGL2 `unpackColorSpace`). Like the three.js wide-gamut example, the canvas and `outputColorSpace` are Display P3 only when the context can present it (`WebGL.isColorSpaceAvailable`) and `(color-gamut: p3)` matches; otherwise output is sRGB, so an sRGB screen is gamut-mapped in the renderer. Moving the window onto another screen follows that media query. `setOutputColorSpace` pins a preview until the next gamut change. Where images can't upload as P3 (WebGL2 without `unpackColorSpace`, i.e. Safari before WebGPU) the working space stays sRGB. Hex colors and sRGB textures look the same; shader color literals now mean P3 values. `setCssColor` from `@nightmarket/sanwei/util/color` also reads `color(display-p3 r g b)`.

### Debug

Debugging follows tiao's debug level (`NEXT_PUBLIC_DEBUG_LEVEL` / `?debug`). The runtime facade is safe to import normally: the package export resolves to the full lazy runtime in development and a no-op module under the `production` condition, so tiao's pane is absent from production bundles.

`Debug.init()` creates a **Performance** pane (FPS / CPU / GPU / draw calls) and each `SanweiApp` opens its own scene pane (`debugPane` overrides its title, order, …). `setup` callbacks draw into a separate host pane, configured with `pane`:

```ts
import { Debug } from "@nightmarket/sanwei/debug-runtime";

const app = await createSanweiApp({
  name: "main",
  canvas,
  renderer,
  debugPane: { title: "Main Canvas" },
  initDebug: () =>
    Debug.init({
      renderer,
      pane: { title: "General" },
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
| `@nightmarket/sanwei/display-p3` | Side-effect opt-in to a Display P3 working color space and canvas |
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
