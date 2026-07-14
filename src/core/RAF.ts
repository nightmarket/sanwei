class RAFBase {
  isSingleton = true;

  delta: number;
  now: number;
  last: number;
  timeElapsed = 0;
  subscribers: string[] = [];
  callbacks: Record<string, () => void> = {};
  lastUpdate: Record<string, number> = {};
  frameRates: Record<string, number | null> = {};

  private rafId: number | null = null;
  private initialized = false;

  constructor() {
    this.delta = 0;
    this.now = this.last = performance.now();
  }

  init = () => {
    if (this.initialized) return;
    this.initialized = true;
    window.addEventListener("focus", this.resetClock);
    if (this.subscribers.length > 0) this.start();
  };

  destroy = () => {
    this.stop();
    window.removeEventListener("focus", this.resetClock);
    this.initialized = false;
    this.subscribers = [];
    this.callbacks = {};
    this.lastUpdate = {};
    this.frameRates = {};
    this.delta = 0;
    this.timeElapsed = 0;
  };

  update = () => {
    this.rafId = null;
    if (this.subscribers.length === 0) return;

    this.now = performance.now();
    this.delta = (this.now - this.last) / 1000;

    this.timeElapsed += this.delta;

    for (let i = 0; i < this.subscribers.length; i++) {
      const id = this.subscribers[i]!;

      const rate = this.frameRates[id];
      if (rate !== null && rate !== undefined && this.now - (this.lastUpdate[id] ?? 0) < rate * 1000) {
        continue;
      }

      this.lastUpdate[id] = this.now;
      this.callbacks[id]?.();
    }

    this.last = this.now;
    if (this.subscribers.length > 0) this.rafId = requestAnimationFrame(this.update);
  };

  subscribe = (id: string, cb: () => void, fps: number | null = null) => {
    if (!(id in this.callbacks)) this.subscribers.push(id);
    this.callbacks[id] = cb;
    this.lastUpdate[id] = performance.now();
    this.frameRates[id] = fps !== null ? 1 / fps : null;
    if (this.initialized) {
      this.start();
    } else {
      this.init();
    }
  };

  unsubscribe = (id: string) => {
    this.subscribers = this.subscribers.filter((s) => s !== id);
    delete this.callbacks[id];
    delete this.lastUpdate[id];
    delete this.frameRates[id];
    if (this.subscribers.length === 0) this.stop();
  };

  private resetClock = () => {
    this.now = this.last = performance.now();
    this.delta = 0;
  };

  private start() {
    if (this.rafId !== null || this.subscribers.length === 0) return;
    this.resetClock();
    this.rafId = requestAnimationFrame(this.update);
  }

  private stop() {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}

export const RAF = new RAFBase();
