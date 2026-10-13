import { FrameState, TUNED_FPS } from "../src/core/RAF";

/** Seeded touch drags through `Mouse` on a steady 60 Hz frame clock: synthetic touches at 60 or 120 Hz,
 * stamped in whole ms like WebKit's, reach the page after some latency and jitter. Prints how evenly the
 * scroll steps while the finger moves steadily, around the lift of a fling, and when the finger stops and
 * starts again. */

const SEED = Number(process.env.SEED ?? 20261013);
const WIDTH = 393;
const HEIGHT = 852;
const INTERVAL = 1000 / 60;
/** Where the frame clock's timestamps sit after vsync. */
const FRAME_OFFSET_MS = 1;

Object.assign(globalThis, {
  window: {
    innerWidth: WIDTH,
    innerHeight: HEIGHT,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    matchMedia: () => ({ matches: true }),
  },
  navigator: { userAgent: "iPhone", maxTouchPoints: 5 },
  Element: class {},
});

type MouseModule = typeof import("../src/core/Mouse");
type Handlers = Record<"handleMousedown" | "handleMousemove" | "handleMouseup", (e: unknown) => void>;

/** A fresh module per run, so no state carries between runs. */
const loadMouse = (run: number): Promise<MouseModule> => import(`../src/core/Mouse.ts?run=${run}`);

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Touches = {
  hz: number;
  /** Offset of the touch sampling clock from vsync, ms. */
  phase: number;
  /** Ms from a touch's stamp to its dispatch: `latency`, give or take up to `jitter`. */
  latency: number;
  jitter: number;
};

type Gesture = { x: (t: number) => number; down: number; up: number; seconds: number };

async function simulate(run: number, touches: Touches, gesture: Gesture, readDelay: number) {
  const { Mouse } = await loadMouse(run);
  Mouse.touchReadDelay = readDelay;
  const handlers = Mouse as unknown as Handlers;
  const random = mulberry32(SEED + run);

  type Event = { dispatch: number; stamp: number; kind: keyof Handlers; x: number };
  const events: Event[] = [];
  const add = (time: number, kind: keyof Handlers) => {
    const dispatch = time + touches.latency + (random() * 2 - 1) * touches.jitter;
    events.push({ dispatch, stamp: Math.round(time), kind, x: gesture.x(time) });
  };
  add(gesture.down, "handleMousedown");
  for (let time = touches.phase; time < gesture.up; time += 1000 / touches.hz) {
    if (time > gesture.down) add(time, "handleMousemove");
  }
  add(gesture.up, "handleMouseup");
  events.sort((a, b) => a.dispatch - b.dispatch);

  const frame = new FrameState();
  const current: number[] = [];
  let next = 0;
  for (let n = 1; n * INTERVAL < gesture.seconds * 1000; n++) {
    const vsync = n * INTERVAL;
    for (let event = events[next]; event && event.dispatch <= vsync + FRAME_OFFSET_MS; event = events[++next]) {
      handlers[event.kind]({
        changedTouches: [{ clientX: event.x, clientY: HEIGHT / 2 }],
        timeStamp: event.stamp,
        target: null,
      });
    }
    Object.assign(frame, {
      time: vsync,
      timestamp: vsync + FRAME_OFFSET_MS,
      delta: INTERVAL / 1000,
      frames: (INTERVAL / 1000) * TUNED_FPS,
      frame: n,
      interval: INTERVAL,
    });
    Mouse.update(frame);
    current.push(Mouse.scroll.current.x);
  }
  return current.slice(1).map((x, i) => x - (current[i] ?? 0));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const fixed = (x: number, digits = 2) => x.toFixed(digits).padStart(5);
const frameAt = (ms: number) => Math.round(ms / INTERVAL) - 1;

/** Steady swipe at 0.8 px/ms: spread of the per-frame steps. */
async function steady(run: number, touches: Touches, readDelay: number) {
  const gesture = { x: (t: number) => 40 + 0.8 * t, down: 3, up: 400, seconds: 0.5 };
  const steps = (await simulate(run, touches, gesture, readDelay)).slice(frameAt(120), frameAt(380));
  const unit = mean(steps);
  const ratios = steps.map((step) => step / unit);
  return `±${fixed((sd(steps) / Math.abs(unit)) * 100, 0)}% (${fixed(Math.min(...ratios))}–${fixed(Math.max(...ratios))}x)`;
}

/** Fling at 1.2 px/ms: steps around the lift, in finger steps. */
async function fling(run: number, touches: Touches, readDelay: number) {
  const up = 300;
  const gesture = { x: (t: number) => 40 + 1.2 * Math.min(t, up), down: 3, up, seconds: 1.4 };
  const steps = await simulate(run, touches, gesture, readDelay);
  const unit = mean(steps.slice(frameAt(150), frameAt(280)));
  const lift = frameAt(up) + 1;
  const around = steps.slice(lift - 2, lift + 6).map((step) => fixed(step / unit));
  const glide = steps.slice(lift).reduce((a, b) => a + b, 0) / unit;
  return `${around.slice(0, 2).join(" ")} | ${around.slice(2).join(" ")}  (glide ${fixed(glide, 1)} steps)`;
}

/** The finger stops dead for 100 ms mid-drag, then goes on: the largest backward step, in finger steps. */
async function stopAndGo(run: number, touches: Touches, readDelay: number) {
  const x = (t: number) => 40 + 1.2 * (t < 200 ? t : t < 300 ? 200 : t - 100);
  const steps = await simulate(run, touches, { x, down: 3, up: 450, seconds: 0.5 }, readDelay);
  const unit = mean(steps.slice(frameAt(60), frameAt(190)));
  const back = Math.max(0, ...steps.slice(frameAt(60)).map((step) => -step / unit));
  return `${fixed(back)}`;
}

const MODELS: [string, Touches][] = [
  ["60 Hz, mid-frame, 4 ±1 ms", { hz: 60, phase: 4, latency: 4, jitter: 1 }],
  ["60 Hz, frame edge, 4 ±1 ms", { hz: 60, phase: 12.2, latency: 4, jitter: 1 }],
  ["60 Hz, 10 ±3 ms", { hz: 60, phase: 3, latency: 10, jitter: 3 }],
  ["120 Hz, 4 ±3 ms", { hz: 120, phase: 3, latency: 4, jitter: 3 }],
  ["120 Hz, 10 ±3 ms", { hz: 120, phase: 3, latency: 10, jitter: 3 }],
  ["120 Hz, 14 ±4 ms", { hz: 120, phase: 3, latency: 14, jitter: 4 }],
];

let run = 0;
for (const readDelay of [0, 1]) {
  console.log(`\ntouchReadDelay ${readDelay} — seed ${SEED}`);
  console.log(
    `${"touches".padEnd(28)}${"steady swipe".padEnd(24)}${"stop/go back".padEnd(14)}fling: 2 before | 6 after the lift`
  );
  for (const [label, touches] of MODELS) {
    const row = [
      await steady(run++, touches, readDelay),
      await stopAndGo(run++, touches, readDelay),
      await fling(run++, touches, readDelay),
    ];
    console.log(`${label.padEnd(28)}${row[0]?.padEnd(24)}${row[1]?.padEnd(14)}${row[2]}`);
  }
}
