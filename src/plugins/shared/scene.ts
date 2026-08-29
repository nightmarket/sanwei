import type { SanweiApp } from "../../core/SanweiApp";

export type SceneTarget = {
  scene?: any;
  getScene?: () => any;
};

export function resolveScene(app: SanweiApp, target?: SceneTarget): any {
  if (target?.scene) return target.scene;
  if (target?.getScene) return target.getScene();
  return app.scenes.scenes[app.scenes.activeSceneIndex]?.scene ?? null;
}

/** Run `attach` once a scene exists. Safe to call before `addScenes`. */
export function whenSceneReady(
  app: SanweiApp,
  target: SceneTarget | undefined,
  attach: (scene: any) => void
): () => void {
  let attached = false;
  const tryAttach = () => {
    if (attached) return;
    const scene = resolveScene(app, target);
    if (!scene) return;
    attached = true;
    attach(scene);
  };
  tryAttach();
  if (attached) return () => {};
  return app.ticker.on(tryAttach, 0);
}
