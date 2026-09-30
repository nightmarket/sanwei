type Subscriber = {
  callback: () => void;
  /** Minimum ms between calls; 0 runs every frame. */
  interval: number;
  last: number;
};

/** One shared requestAnimationFrame loop. Runs only while it has subscribers. */
class RAFBase {
  isSingleton = true;

  /** Seconds since the previous frame. */
  delta = 0;
  now = performance.now();

  private last = this.now;
  private subscribers = new Map<string, Subscriber>();
  private rafId: number | null = null;
  private initialized = false;

  init = () => {
    if (this.initialized) return;
    this.initialized = true;
    // Hidden tabs get no frames; don't let the first frame back report the whole gap as `delta`.
    document.addEventListener("visibilitychange", this.resetClock);
  };

  destroy = () => {
    this.stop();
    document.removeEventListener("visibilitychange", this.resetClock);
    this.initialized = false;
    this.subscribers.clear();
    this.delta = 0;
  };

  update = () => {
    this.rafId = null;
    if (this.subscribers.size === 0) return;

    this.now = performance.now();
    this.delta = (this.now - this.last) / 1000;

    for (const subscriber of this.subscribers.values()) {
      if (this.now - subscriber.last < subscriber.interval) continue;
      subscriber.last = this.now;
      subscriber.callback();
    }

    this.last = this.now;
    if (this.subscribers.size > 0) this.rafId = requestAnimationFrame(this.update);
  };

  subscribe = (id: string, callback: () => void, fps: number | null = null) => {
    this.subscribers.set(id, { callback, interval: fps ? 1000 / fps : 0, last: performance.now() });
    this.init();
    this.start();
  };

  unsubscribe = (id: string) => {
    this.subscribers.delete(id);
    if (this.subscribers.size === 0) this.stop();
  };

  private resetClock = () => {
    this.now = this.last = performance.now();
    this.delta = 0;
  };

  private start() {
    if (this.rafId !== null) return;
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
