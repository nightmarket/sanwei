import { Box3Helper, type Scene } from "three";
import type { DebugContext } from "../core/debugHelpers";
import type { PhysicsWorld } from "./PhysicsWorld";

/**
 * tiao helper: adds a "Show Bounding Boxes" toggle that overlays a
 * `Box3Helper` per body, and per convex piece for bodies given `parts`. Helpers
 * reference the live boxes, so they track position + rotated extents
 * automatically every frame — use it to verify collisions happen at the edges.
 *
 * Returns a dispose function.
 */
export function attachBoundsDebug(
  world: PhysicsWorld,
  scene: Scene,
  { pane, debug }: DebugContext,
  {
    title = "Physics",
    color = 0x00ff88,
    partColor = 0x0088ff,
  }: { title?: string; color?: number; partColor?: number } = {}
) {
  const folder = pane.addFolder({ title, expanded: false });
  debug.register(title, folder);

  const params = { showBounds: false };
  let helpers: Box3Helper[] = [];

  const removeHelpers = () => {
    for (const helper of helpers) {
      scene.remove(helper);
      helper.dispose();
    }
    helpers = [];
  };

  const addHelpers = () => {
    removeHelpers();
    for (const body of world.bodies) {
      helpers.push(new Box3Helper(body.worldAABB, color));
      for (const bounds of body.worldPartBounds) {
        if (bounds !== body.worldAABB) helpers.push(new Box3Helper(bounds, partColor));
      }
    }
    for (const helper of helpers) scene.add(helper);
  };

  folder.addBinding(params, "showBounds", { label: "Show Bounding Boxes" }).on("change", (ev: { value: boolean }) => {
    if (ev.value) addHelpers();
    else removeHelpers();
  });

  return () => {
    removeHelpers();
    folder.dispose();
  };
}
