export type TickCallback = (ticker: Ticker) => void;

/**
 * Per-app ordered tick bus. Callbacks run by numeric order (low first).
 * Driven by {@link SanweiApp.update} from the shared RAF loop.
 */
export class Ticker {
  elapsed = 0;
  delta = 1 / 60;
  maxDelta = 1 / 30;
  scale = 1;
  deltaScaled = 1 / 60;
  elapsedScaled = 0;

  private slots = new Map<number, TickCallback[]>();
  private orders: number[] = [];
  private waits: Array<{ frames: number; callback: () => void }> = [];
  private started = false;

  on(callback: TickCallback, order = 1): () => void {
    let list = this.slots.get(order);
    if (!list) {
      list = [];
      this.slots.set(order, list);
      this.orders.push(order);
      this.orders.sort((a, b) => a - b);
    }
    list.push(callback);
    return () => this.off(callback);
  }

  off(callback: TickCallback) {
    for (const [order, list] of this.slots) {
      const index = list.indexOf(callback);
      if (index !== -1) {
        list.splice(index, 1);
        if (list.length === 0) {
          this.slots.delete(order);
          this.orders = this.orders.filter((value) => value !== order);
        }
        return;
      }
    }
  }

  /** Run `callback` after `frames` ticks. */
  wait(frames: number, callback: () => void) {
    this.waits.push({ frames, callback });
  }

  update(elapsedSeconds: number) {
    if (!this.started) {
      this.elapsed = elapsedSeconds;
      this.started = true;
    }

    this.delta = Math.min(Math.max(elapsedSeconds - this.elapsed, 0), this.maxDelta);
    this.elapsed = elapsedSeconds;
    this.deltaScaled = this.delta * this.scale;
    this.elapsedScaled += this.deltaScaled;

    for (let i = 0; i < this.waits.length; i++) {
      const wait = this.waits[i]!;
      wait.frames -= 1;
      if (wait.frames <= 0) {
        wait.callback();
        this.waits.splice(i, 1);
        i -= 1;
      }
    }

    for (const order of this.orders) {
      const list = this.slots.get(order);
      if (!list) continue;
      for (const callback of list) {
        callback(this);
      }
    }
  }

  dispose() {
    this.slots.clear();
    this.orders = [];
    this.waits = [];
  }
}
