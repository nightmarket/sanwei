import { AiPlugin } from "@nightmarket/sanwei/plugins/ai";
import { useEnvironment } from "@nightmarket/sanwei/plugins/environment";
import { PhysicsPlugin } from "@nightmarket/sanwei/plugins/physics";
import {
  createSanweiApp,
  createWebGPURenderer,
  THREE,
} from "@nightmarket/sanwei/three-webgpu";
import { PlaygroundScene } from "./PlaygroundScene";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("missing #game canvas");

let renderer;
try {
  renderer = await createWebGPURenderer({ canvas });
} catch (error) {
  const hud = document.querySelector("#hud");
  if (hud) hud.textContent = error instanceof Error ? error.message : "Failed to create renderer";
  throw error;
}
renderer.shadowMap.enabled = true;

const app = await createSanweiApp({ name: "playground", canvas, renderer });

await useEnvironment(app, {
  time: { dayDuration: 90 },
  lighting: { radius: 28 },
  sky: { fogNear: 12, fogFar: 70 },
});
await app.use(new AiPlugin());

try {
  await app.use(new PhysicsPlugin());
} catch (error) {
  console.warn("Physics plugin skipped. Install @dimforge/rapier3d to enable crates.", error);
}

const scene = new PlaygroundScene();
await app.scenes.addScenes([scene], ["Playground"]);
app.cameras.addCameras([
  {
    key: "main",
    fov: 50,
    near: 0.1,
    far: 200,
    position: new THREE.Vector3(14, 12, 18),
    lookAt: new THREE.Vector3(0, 0, 0),
  },
]);

app.start();
