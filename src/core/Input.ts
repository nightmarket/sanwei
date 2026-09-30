export class InputClass {
  isSingleton = true;

  #keys: Record<string, boolean> = {};
  #callbacks: Record<string, (() => void)[]> = {};

  #onKeyDown = (e: KeyboardEvent) => {
    this.#keys[e.key] = true;
    const callbacks = this.#callbacks[e.key];
    if (callbacks) for (const callback of callbacks) callback();
  };

  #onKeyUp = (e: KeyboardEvent) => {
    this.#keys[e.key] = false;
  };

  isKeyDown(key: string): boolean {
    return !!this.#keys[key];
  }

  subscribe(key: string, callback: () => void) {
    this.#callbacks[key] = [...(this.#callbacks[key] ?? []), callback];
  }

  unsubscribe(key: string, callback?: () => void) {
    this.#callbacks[key] = callback ? (this.#callbacks[key]?.filter((cb) => cb !== callback) ?? []) : [];
  }

  init() {
    window.addEventListener("keydown", this.#onKeyDown);
    window.addEventListener("keyup", this.#onKeyUp);
  }

  destroy() {
    window.removeEventListener("keydown", this.#onKeyDown);
    window.removeEventListener("keyup", this.#onKeyUp);
    this.#keys = {};
    this.#callbacks = {};
  }
}

export const Input = new InputClass();
