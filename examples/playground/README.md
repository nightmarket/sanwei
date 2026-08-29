# sanwei playground

Local boilerplate game. It is not published with `@nightmarket/sanwei`.

Shows the engine loop plus every first-wave plugin: day cycle, weather, wind, sky, lighting, rain/snow/lightning, optional Rapier crates, and wander agents.

```sh
pnpm install
pnpm dev
```

Or from the package root:

```sh
pnpm example
```

WASD moves the capsule. Space jumps. The HUD prints day progress and weather. Crates need `@dimforge/rapier3d` (optional dependency).
