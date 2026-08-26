import type * as THREETypes from "three";
import type { DebugContext } from "../core/debugHelpers";
import { THREE } from "../three-adapter";
import type { PhysicsWorld } from "./PhysicsWorld";

/**
 * tiao helper: adds a "Show Bounding Boxes" toggle that overlays a
 * `Box3Helper` per body. Helpers reference each body's live `worldAABB`, so
 * they track position + rotated extents automatically every frame — use it to
 * verify collisions happen exactly at the box edges.
 *
 * Returns a dispose function.
 */
export function attachBoundsDebug(
  world: PhysicsWorld,
  scene: THREETypes.Scene,
  { pane, debug }: DebugContext,
  { title = "🧊 Physics", color = 0x00ff88 }: { title?: string; color?: number } = {}
) {
  const folder = pane.addFolder({ title, expanded: false });
  debug.register(title, folder);

  const params = { showBounds: false };
  let helpers: THREETypes.Box3Helper[] = [];

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
      const helper = new THREE.Box3Helper(body.worldAABB, color);
      scene.add(helper);
      helpers.push(helper);
    }
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
