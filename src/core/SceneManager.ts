import type { DebugContext } from "./debugHelpers";
import type { IScene, ITransitionController } from "./types";

export class SceneManagerClass {
  isSingleton = true;

  scenes: IScene[] = [];
  sceneNames: string[] = [];
  activeSceneIndex = 0;

  /** Transition controller — set by consumer via setTransitionController(). */
  transition: ITransitionController | null = null;

  private transitionToIndex = -1;

  // Debug controls
  private debugContext: DebugContext | null = null;
  private debugFolder: any = null;
  private sceneSelector: any = null;

  async init() {}

  /** Set the transition controller (WebGL or WebGPU variant). */
  setTransitionController(controller: ITransitionController) {
    this.transition = controller;
  }

  async initDebug(context: DebugContext) {
    this.debugContext = context;

    if (this.sceneNames.length <= 1) {
      return;
    }

    this.debugFolder = context.pane.addFolder({
      title: "🎬 Scene Manager",
      expanded: false,
    });
    context.debug.register("SceneManager", this.debugFolder);

    this.updateSceneSelector();

    const nav = this.debugFolder.addFolder({
      title: "Navigation",
      expanded: true,
    });

    nav.addButton({ title: "◀ Previous", label: "" }).on("click", () => this.previousScene());

    nav.addButton({ title: "Next ▶", label: "" }).on("click", () => this.nextScene());
  }

  private updateSceneSelector() {
    if (this.sceneSelector) {
      this.sceneSelector.dispose();
    }

    if (!this.debugFolder || this.sceneNames.length === 0) return;

    const options = this.sceneNames.reduce(
      (acc, name, index) => {
        acc[name] = index;
        return acc;
      },
      {} as Record<string, number>
    );

    const state = { scene: this.activeSceneIndex };

    this.sceneSelector = this.debugFolder.addBinding(state, "scene", {
      label: "Active Scene",
      options,
    });

    this.sceneSelector.on("change", (ev: any) => {
      if (!ev.last) return;
      this.transitionTo(ev.value);
    });
  }

  async addScenes(scenes: IScene[], names?: string[]) {
    this.scenes = scenes;
    this.sceneNames = names || scenes.map((s, i) => (s as any).constructor?.name || `Scene ${i + 1}`);

    for (const scene of this.scenes) {
      await scene.init();

      if (this.debugContext && scene.initDebug) {
        await scene.initDebug(this.debugContext);
      }
    }

    this.updateSceneVisibility();

    if (this.debugContext && this.debugFolder) {
      this.updateSceneSelector();
    }

    this.debugContext?.debug.flushWarnings();
  }

  private updateSceneVisibility() {
    for (let i = 0; i < this.scenes.length; i++) {
      const scene = this.scenes[i]!;
      scene.scene.visible = i === this.activeSceneIndex;
    }
  }

  /** Switch to a scene immediately (no transition). */
  transitionTo(sceneIndex: number) {
    if (sceneIndex < 0 || sceneIndex >= this.scenes.length) return;
    if (sceneIndex === this.activeSceneIndex) return;

    this.activeSceneIndex = sceneIndex;
    this.updateSceneVisibility();
  }

  /**
   * Start an animated transition to a scene.
   * The consumer controls `SceneManager.transition.progress` (0 → 1),
   * then calls `completeTransition()` when done.
   */
  startTransition(toIndex: number) {
    if (toIndex < 0 || toIndex >= this.scenes.length) return;
    if (toIndex === this.activeSceneIndex) return;

    if (!this.transition) {
      // No transition controller — fall back to immediate switch
      this.transitionTo(toIndex);
      return;
    }

    if (!this.transition.isActive) {
      this.transition.init();
    }

    this.transitionToIndex = toIndex;
    this.transition.start(this.scenes[this.activeSceneIndex]!, this.scenes[toIndex]!);
  }

  /** Finalize a transition — sets the new active scene. */
  completeTransition() {
    this.transition?.stop();

    if (this.transitionToIndex >= 0) {
      this.activeSceneIndex = this.transitionToIndex;
      this.transitionToIndex = -1;
      this.updateSceneVisibility();
    }
  }

  /** Cancel an in-progress transition without changing the active scene. */
  cancelTransition() {
    this.transition?.stop();
    this.transitionToIndex = -1;
    this.updateSceneVisibility();
  }

  nextScene() {
    const next = (this.activeSceneIndex + 1) % this.scenes.length;
    this.transitionTo(next);
  }

  previousScene() {
    const prev = (this.activeSceneIndex - 1 + this.scenes.length) % this.scenes.length;
    this.transitionTo(prev);
  }

  resize() {
    for (const scene of this.scenes) {
      scene.resize();
    }
    if (this.transition?.isActive) {
      this.transition.resize();
    }
  }

  render() {
    // During a transition, render both scenes into targets and composite
    if (this.transition?.isActive) {
      this.transition.render();
      return;
    }

    const activeScene = this.scenes[this.activeSceneIndex];
    if (activeScene) {
      activeScene.render();
    }
  }

  destroy() {
    this.transition?.destroy();

    for (const s of this.scenes) {
      s.destroy();
    }

    this.scenes = [];
    this.sceneNames = [];
    this.activeSceneIndex = 0;

    if (this.debugFolder) {
      this.debugFolder.dispose();
      this.debugFolder = null;
    }
    this.debugContext = null;
  }
}

export const SceneManager = new SceneManagerClass();
