import { clamp } from "three/src/math/MathUtils.js";
import { AdaptivePixelRatio } from "../src/core/AdaptivePixelRatio";
import { type FrameRate, type RAF, TUNED_FPS } from "../src/core/RAF";

const SEED = Number(process.env.SEED ?? 20261012);
const MIN_RATIO = 0.75;
const MAX_RATIO = 2;

const queued: FrameRequestCallback[] = [];
Object.assign(globalThis, {
  requestAnimationFrame: (callback: FrameRequestCallback) => queued.push(callback),
  cancelAnimationFrame: () => {
    queued.length = 0;
  },
  document: { hidden: false, addEventListener: () => {}, removeEventListener: () => {} },
});

/** A fresh module per run, so each run's loop starts from its own 60 Hz first guess. */
const loadLoop = (run: number): Promise<{ RAF: typeof RAF }> => import(`../src/core/RAF.ts?run=${run}`);

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 30;
const KEPT_SAMPLES = 28;
const STEP = 0.25;
const STARTUP_COOLDOWN_S = 3;
const CHANGE_COOLDOWN_S = 1;
const SETTLE_S = 3;
const RETRY_S = 20;
const SLOW = 1.08;
const ON_TIME = 1.02;

/** `AdaptivePixelRatio` as of sanwei 0.7.9, before it counted dropped frames, with `update` verbatim. */
class OldAdaptivePixelRatio {
  ratio: number;
  private cooldown = STARTUP_COOLDOWN_S;
  private failures = new Map<number, number>();
  private fastest = 1;
  private samples: number[] = [];
  private settled = 0;
  private time = 0;

  constructor(
    private readonly min: number,
    private readonly max: number,
    start: number
  ) {
    this.ratio = clamp(start, min, max);
  }

  update(delta: number) {
    this.time += delta;
    if (delta > 1 / 500) this.fastest = Math.min(this.fastest, delta);
    if (this.cooldown > 0) {
      this.cooldown -= delta;
      this.samples.length = 0;
      return false;
    }
    this.samples.push(delta);
    if (this.samples.length < SAMPLES) return false;

    const kept = this.samples.sort((a, b) => a - b).slice(0, KEPT_SAMPLES);
    this.samples.length = 0;
    const average = kept.reduce((sum, sample) => sum + sample, 0) / kept.length;
    const interval = Math.max(this.fastest, 1 / TUNED_FPS);
    if (average > interval * SLOW && this.ratio > this.min) {
      this.failures.set(this.ratio, this.time);
      return this.change(Math.max(this.min, this.ratio - STEP));
    }
    this.settled = average < interval * ON_TIME ? this.settled + average * kept.length : 0;
    const next = Math.min(this.max, this.ratio + STEP);
    const failedAt = this.failures.get(next);
    const retry = failedAt === undefined || this.time - failedAt > RETRY_S;
    return this.settled > SETTLE_S && next > this.ratio && retry && this.change(next);
  }

  private change(ratio: number) {
    this.ratio = ratio;
    this.settled = 0;
    this.cooldown = CHANGE_COOLDOWN_S;
    return true;
  }
}

type Stamps = { grain: number; late: number; hitches: number };
/** Whole ms, landing up to 1.5 ms late; 1.25% of frames hitch and the next one catches up on its vsync. */
const WEBKIT: Stamps = { grain: 1, late: 1.5, hitches: 0.0125 };
/** Vsync-aligned, to 100 µs. */
const CHROME: Stamps = { grain: 0.1, late: 0.16, hitches: 0 };

type Change = { s: number; ratio: number };
type Sample = {
  frame: number;
  wall: number;
  time: number;
  step: number;
  raw: number;
  dropped: number;
  interval: number;
};
type Call = { frame: number; dropped: number };
type Run = {
  start: number;
  final: number;
  changes: Change[];
  /** What an unthrottled callback saw each frame. */
  frames: Sample[];
  /** What the callback feeding the controller saw each time it ran. */
  calls: Call[];
  stepSD: number;
  drift: number;
};
type Check = { label: string; ok: boolean };

type Scenario = {
  name: string;
  stamps: Stamps;
  /** Display refresh rate at a wall time in ms. */
  hz: (ms: number) => number;
  /** Ms a frame's work takes at a pixel ratio; the next frame waits for the first vsync after it. */
  cost: (ratio: number) => number;
  start: number;
  seconds: number;
  /** Throttle on the callback that feeds the controller. */
  fps?: FrameRate;
  /** Feed the 0.7.9 controller the raw deltas the old loop handed out. */
  old?: boolean;
  checks: (run: Run) => Check[];
  note?: (run: Run) => string;
};

const sd = (values: number[]) => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
};

function simulate(scenario: Scenario, loop: typeof RAF): Run {
  const { stamps, start } = scenario;
  const random = mulberry32(SEED);
  const adaptive = scenario.old
    ? new OldAdaptivePixelRatio(MIN_RATIO, MAX_RATIO, start)
    : new AdaptivePixelRatio(MIN_RATIO, MAX_RATIO, start);
  const changes: Change[] = [];
  const frames: Sample[] = [];
  const calls: Call[] = [];
  let wall = 0;
  let raw = 0;
  let calledAt = 0;

  loop.subscribe(({ frame, time, delta, dropped, interval }) =>
    frames.push({ frame, wall, time, step: delta * 1000, raw, dropped, interval })
  );
  loop.subscribe(
    (frame) => {
      calls.push({ frame: frame.frame, dropped: frame.dropped });
      const changed =
        adaptive instanceof OldAdaptivePixelRatio
          ? adaptive.update(clamp((wall - calledAt) / 1000, 0, 0.25))
          : adaptive.update(frame);
      calledAt = wall;
      if (changed) changes.push({ s: wall / 1000, ratio: adaptive.ratio });
    },
    { fps: scenario.fps }
  );

  const nextVsync = (ms: number) => ms + 1000 / scenario.hz(ms);
  let vsync = 0;
  let first: number | null = null;
  let previous = 0;
  while (vsync < scenario.seconds * 1000) {
    const period = 1000 / scenario.hz(vsync);
    const hitch = random() < stamps.hitches;
    if (hitch) vsync += Math.floor(random() * 3) * period;
    const landed = vsync + (hitch ? period * (0.1 + 0.75 * random()) : stamps.late * random());
    const timestamp = Math.floor(landed / stamps.grain) * stamps.grain;
    raw = first === null ? 0 : timestamp - previous;
    first ??= timestamp;
    wall = timestamp - first;
    previous = timestamp;
    const callback = queued.shift();
    if (!callback) throw new Error(`${scenario.name}: the loop stopped scheduling frames`);
    callback(timestamp);
    const done = landed + scenario.cost(adaptive.ratio) + random();
    vsync = nextVsync(vsync);
    while (vsync < done) vsync = nextVsync(vsync);
  }
  loop.destroy();

  const onTime = frames.filter((sample) => sample.wall >= 1000 && sample.dropped === 0);
  return {
    start,
    final: adaptive.ratio,
    changes,
    frames,
    calls,
    stepSD: sd(onTime.map((sample) => (scenario.old ? sample.raw : sample.step))),
    drift: frames.reduce((most, sample) => Math.max(most, Math.abs(sample.time - sample.wall)), 0),
  };
}

const ratios = (run: Run) => [run.start, ...run.changes.map((change) => change.ratio)];
const ratioAt = (run: Run, s: number) => run.changes.filter((change) => change.s <= s).at(-1)?.ratio ?? run.start;
const stepDowns = (run: Run) =>
  run.changes.filter((change, i) => change.ratio < (run.changes[i - 1]?.ratio ?? run.start)).length;

/** The ratio held longest between two wall times in seconds. */
function heldMost(run: Run, from: number, to: number) {
  const held = new Map<number, number>();
  let ratio = ratioAt(run, from);
  let since = from;
  for (const change of run.changes.filter((change) => change.s > from && change.s < to)) {
    held.set(ratio, (held.get(ratio) ?? 0) + change.s - since);
    ratio = change.ratio;
    since = change.s;
  }
  held.set(ratio, (held.get(ratio) ?? 0) + to - since);
  return [...held].reduce((most, entry) => (entry[1] > most[1] ? entry : most))[0];
}

const reseedFrame = (run: Run, hz: number) =>
  run.frames.find((sample) => Math.abs(sample.interval - 1000 / hz) < 0.1)?.frame ?? -1;

/** Throttled calls whose `dropped` isn't the drop on the frame right after their previous call, and drops
 * later in the span that they rightly left out. */
function throttledDrops(run: Run) {
  const droppedAt = new Map(run.frames.map((sample) => [sample.frame, sample.dropped]));
  let mismatched = 0;
  let skipped = 0;
  let previous: Call | null = null;
  for (const call of run.calls) {
    if (previous) {
      if (call.dropped !== droppedAt.get(previous.frame + 1)) mismatched++;
      for (let frame = previous.frame + 2; frame <= call.frame; frame++) if (droppedAt.get(frame)) skipped++;
    }
    previous = call;
  }
  return { mismatched, skipped };
}

const equal = (label: string, actual: number, expected: number): Check => ({
  label: `${label} ${actual}, want ${expected}`,
  ok: actual === expected,
});
const under = (label: string, actual: number, bound: number): Check => ({
  label: `${label} ${actual.toFixed(3)}, want < ${bound}`,
  ok: actual < bound,
});

const at60 = () => 60;
/** The same at any ratio, so every light run, the 0.7.9 one included, sees the same frames. */
const light = () => 2;

const scenarios: Scenario[] = [
  {
    name: "1 WebKit 60 Hz, light, 10 min",
    stamps: WEBKIT,
    hz: at60,
    cost: light,
    start: 1,
    seconds: 600,
    checks: (run) => [
      equal("final ratio", run.final, 2),
      equal("step-downs", stepDowns(run), 0),
      under("on-time step SD ms", run.stepSD, 0.5),
      under("max |loop - wall| ms", run.drift, 25),
    ],
  },
  {
    name: "1 WebKit 60 Hz, light, 10 min",
    old: true,
    stamps: WEBKIT,
    hz: at60,
    cost: light,
    start: 1,
    seconds: 600,
    checks: (run) => [equal("final ratio", run.final, 0.75), equal("changes", run.changes.length, 1)],
    note: (run) => `pinned at 0.75 from ${run.changes[0]?.s.toFixed(1)} s`,
  },
  {
    name: "2 Chrome 60 Hz, light, 2 min",
    stamps: CHROME,
    hz: at60,
    cost: light,
    start: 1,
    seconds: 120,
    checks: (run) => [
      equal("final ratio", run.final, 2),
      equal("step-downs", stepDowns(run), 0),
      under("on-time step SD ms", run.stepSD, 0.06),
    ],
  },
  {
    name: "2 Chrome 60 Hz, light, 2 min",
    old: true,
    stamps: CHROME,
    hz: at60,
    cost: light,
    start: 1,
    seconds: 120,
    checks: (run) => [equal("final ratio", run.final, 2)],
  },
  {
    name: "3 Chrome 120 Hz, light, 2 min",
    stamps: CHROME,
    hz: () => 120,
    cost: light,
    start: 1,
    seconds: 120,
    checks: (run) => [
      equal("frame the interval reads 8.33 ms", reseedFrame(run, 120), 5),
      equal("final ratio", run.final, 2),
      equal("step-downs", stepDowns(run), 0),
    ],
    note: (run) => `interval ${run.frames.at(-1)?.interval.toFixed(3)} ms from frame ${reseedFrame(run, 120)}`,
  },
  {
    name: "4 GPU-bound 6*ratio^2 ms, WebKit 60 Hz, 5 min",
    stamps: WEBKIT,
    hz: at60,
    cost: (ratio) => 6 * ratio ** 2,
    start: 1,
    seconds: 300,
    checks: (run) => [
      equal("ratio held longest over the last 150 s", heldMost(run, 150, 300), 1.5),
      equal("lowest ratio", Math.min(...ratios(run)), 1),
    ],
    note: (run) => `held ${heldMost(run, 150, 300)} longest over the last 150 s`,
  },
  {
    name: "5 CPU-bound 20 ms, WebKit 60 Hz, 2 min",
    stamps: WEBKIT,
    hz: at60,
    cost: () => 20,
    start: 1.5,
    seconds: 120,
    checks: (run) => [
      equal("final ratio", run.final, 1.5),
      equal("lowest ratio", Math.min(...ratios(run)), 0.75),
      equal("changes", run.changes.length, 4),
    ],
    note: (run) => `held ${run.final} from ${run.changes.at(-1)?.s.toFixed(1)} s`,
  },
  {
    name: "6 Low Power Mode 30 Hz 20-50 s, WebKit, 90 s",
    stamps: WEBKIT,
    hz: (ms) => (ms >= 20_000 && ms < 50_000 ? 30 : 60),
    cost: light,
    start: 1,
    seconds: 90,
    checks: (run) => [
      equal("final ratio", run.final, 2),
      equal("ratio as the cap lifts (its ratio as the cap began)", ratioAt(run, 50), ratioAt(run, 20)),
    ],
    note: (run) => `${ratioAt(run, 20)} at 20 s, ${ratioAt(run, 50)} at 50 s`,
  },
  {
    name: "7 fps 8 subscriber, WebKit 60 Hz, light, 10 min",
    stamps: WEBKIT,
    hz: at60,
    cost: light,
    start: 1,
    seconds: 600,
    fps: 8,
    checks: (run) => {
      const { mismatched, skipped } = throttledDrops(run);
      return [
        equal("final ratio", run.final, 2),
        equal("step-downs", stepDowns(run), 0),
        equal("calls whose dropped isn't the frame right after their last", mismatched, 0),
        { label: `drops later in a span, left out ${skipped}, want > 0`, ok: skipped > 0 },
      ];
    },
    note: (run) => `${run.calls.length} calls, ${throttledDrops(run).skipped} later-in-span drops left out`,
  },
];

const results = await Promise.all(
  scenarios.map(async (scenario, i) => {
    const run = simulate(scenario, (await loadLoop(i)).RAF);
    return { scenario, run, checks: scenario.checks(run) };
  })
);

const webkit = results[0]?.run.frames.slice(1) ?? [];
const share = (ms: number) =>
  `${ms} ms ${((100 * webkit.filter((sample) => sample.raw === ms).length) / webkit.length).toFixed(1)}%`;
console.log(`seed ${SEED}; case 1 WebKit deltas: ${[14, 15, 16, 17, 18].map(share).join(", ")}`);

const header = ["case", "controller", "ratio", "low-high", "changes", "step SD ms", "drift ms", "checks", "note"];
const rows = results.map(({ scenario, run, checks }) => [
  scenario.name,
  scenario.old ? "0.7.9" : "new",
  `${run.start} -> ${run.final}`,
  `${Math.min(...ratios(run))}-${Math.max(...ratios(run))}`,
  String(run.changes.length),
  run.stepSD.toFixed(3),
  scenario.old ? "-" : run.drift.toFixed(1),
  `${checks.filter((check) => check.ok).length}/${checks.length}`,
  scenario.note?.(run) ?? "",
]);
const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)));
for (const row of [header, ...rows]) {
  console.log(
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd()
  );
}
console.log("");
for (const { scenario, checks } of results) {
  for (const check of checks) console.log(`${check.ok ? "ok  " : "FAIL"}  ${scenario.name}: ${check.label}`);
}
if (results.some(({ checks }) => checks.some((check) => !check.ok))) process.exitCode = 1;
