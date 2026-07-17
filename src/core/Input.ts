export class InputClass {
  isSingleton = true;

  #keys: Record<string, boolean> = {};
  #previousKeys: Record<string, boolean> = {};
  #callbacks: Record<string, (() => void)[]> = {};

  // Store bound handlers for proper cleanup
  #boundKeyDown = (e: KeyboardEvent) => this.#onKeyDown(e);
  #boundKeyUp = (e: KeyboardEvent) => this.#onKeyUp(e);

  #onKey(e: KeyboardEvent, pressed: boolean) {
    this.#keys[e.key] = pressed;
  }

  #onKeyDown(e: KeyboardEvent) {
    this.#onKey(e, true);

    const cbs = e.key ? this.#callbacks[e.key] : undefined;
    if (cbs) {
      for (const callback of cbs) {
        callback();
      }
    }
  }

  #onKeyUp(e: KeyboardEvent) {
    this.#onKey(e, false);
  }

  update(_delta?: number) {
    for (const key in this.#previousKeys) {
      if (!(key in this.#keys)) delete this.#previousKeys[key];
    }
    for (const key in this.#keys) {
      this.#previousKeys[key] = this.#keys[key];
    }
  }

  isKeyDown(key: string): boolean {
    return !!this.#keys[key];
  }

  wasKeyPressed(key: string): boolean {
    return !!this.#keys[key] && !this.#previousKeys[key];
  }

  subscribe(key: string, callback: () => void) {
    if (!this.#callbacks[key]) {
      this.#callbacks[key] = [];
    }
    this.#callbacks[key].push(callback);
  }

  unsubscribe(key: string, callback?: () => void) {
    if (!callback) {
      this.#callbacks[key] = [];
    } else {
      this.#callbacks[key] =
        this.#callbacks[key]?.filter((cb) => cb !== callback) ?? [];
    }
  }

  async init() {
    window.addEventListener("keydown", this.#boundKeyDown);
    window.addEventListener("keyup", this.#boundKeyUp);
  }

  destroy() {
    window.removeEventListener("keydown", this.#boundKeyDown);
    window.removeEventListener("keyup", this.#boundKeyUp);
    this.#keys = {};
    this.#previousKeys = {};
    this.#callbacks = {};
  }
}

export const Input = new InputClass();
