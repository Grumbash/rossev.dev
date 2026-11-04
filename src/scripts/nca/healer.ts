// Recovery guard for the GR automaton. The model heals bites and cuts, but cells only
// see their neighbours: from a thin strip of survivors it cannot tell where G and R
// were, and it settles into a wrong stable shape (a long bar) or, with weaker weights,
// regrows one letter as the other. The healer watches the pattern through cheap stats
// read off the RGBA buffer (no target image: the page does not ship it) and, when too
// little is left or the pattern settles into the wrong shape, regrows it honestly
// from a single cell. It also decides when the pattern has stopped changing, so the
// worker's loop runs exactly as long as healing takes instead of a fixed budget.
// Thresholds are measured on public/nca/gr.bin and scripts/nca/gr-round1.bin; see
// tests/nca-regrow.test.ts.
import type { NeuralCA } from './model';

/** 'regrowing' is returned once, by the call that started a regrow from a single cell. */
export type HealerStatus = 'running' | 'settled' | 'regrowing';

export interface HealerOptions {
  /** Steps the silent first grow takes. */
  grownSteps?: number;
  /** After damage, fewer alive cells than this fraction of the grown baseline regrows. */
  minAliveFraction?: number;
  /** Steps without change before a pattern that looks like the grown one counts as settled. */
  settleWindow?: number;
  /** Steps without change before a pattern that looks wrong is given up on and regrown. */
  wrongWindow?: number;
  /** Hard cap on steps since the last damage or regrow; the shape is judged then. */
  maxSteps?: number;
}

/** Coarse signature of a frame: alive count, bounding box, and per block of a GRID×GRID
 * grid its alive cells and its green mass (the R sits on a lime block, the G is black). */
interface Shape {
  alive: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  occ: Float64Array;
  green: Float64Array;
}

const GRID = 4;
// Settling: a frame within these of the window's anchor frame counts as unchanged.
// The automaton fires cells at random, so a still GR jitters by ~±10 alive cells (1%).
const STILL_ALIVE = 0.02; // of the baseline alive count
const STILL_SHAPE = 0.04; // signature distance, see `distance`
const STILL_EDGE = 1; // px each bbox edge may wobble
/** Rows and columns with fewer live cells than this are left out of the bounding box. */
const BBOX_MIN_CELLS = 3;
// Judging a settled shape against the grown baseline.
const ALIVE_TOLERANCE = 0.15;
const MIN_BBOX_IOU = 0.85;
const MAX_SHAPE_DISTANCE = 0.08;
/** Healing only refills what was lost; this much more than the grown count is a wrong shape
 * spreading, judged after `settleWindow` steps of it without waiting for it to stop. */
const OVERGROWN = 1.3;
/** Regrows started by a wrong settle in a row; a model that keeps failing is left as is. */
const MAX_AUTO_REGROWS = 2;

export function createHealer(ca: NeuralCA, opts: HealerOptions = {}) {
  const aliveThreshold = ca.aliveThreshold;
  const grownSteps = opts.grownSteps ?? 300;
  const minAliveFraction = opts.minAliveFraction ?? 0.4;
  const settleWindow = opts.settleWindow ?? 200;
  const wrongWindow = opts.wrongWindow ?? 600;
  const maxSteps = opts.maxSteps ?? 3000;
  const n = ca.size;

  const rgba = new Float32Array(n * n * 4);
  const newShape = (): Shape => ({ alive: 0, x0: 0, y0: 0, x1: 0, y1: 0, occ: new Float64Array(GRID * GRID), green: new Float64Array(GRID * GRID) });
  const baseline = newShape();
  const anchor = newShape();
  const now = newShape();
  const rows = new Uint16Array(n);
  const cols = new Uint16Array(n);

  let settled = true;
  let stillFor = 0; // steps the current frame has matched the anchor
  let overFor = 0; // steps the pattern has been overgrown
  let since = 0; // steps since the last damage or (re)growth started
  let autoRegrows = 0;

  /** Reads the CA into `rgba` and its signature into `s`. */
  function measure(s: Shape): void {
    ca.rgba(rgba);
    s.alive = 0;
    s.occ.fill(0);
    s.green.fill(0);
    rows.fill(0);
    cols.fill(0);
    for (let y = 0; y < n; y++) {
      const row = Math.floor((y * GRID) / n) * GRID;
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        if (rgba[i + 3] <= aliveThreshold) continue;
        s.alive++;
        rows[y]++;
        cols[x]++;
        const k = row + Math.floor((x * GRID) / n);
        s.occ[k]++;
        s.green[k] += rgba[i + 1];
      }
    }
    // Bounding box of the rows and columns that hold a stroke: a lone live cell at the
    // edge (the model leaves one now and then) would otherwise swing it by many pixels.
    s.x0 = s.y0 = n;
    s.x1 = s.y1 = -1;
    for (let k = 0; k < n; k++) {
      if (rows[k] >= BBOX_MIN_CELLS) {
        if (s.y0 === n) s.y0 = k;
        s.y1 = k;
      }
      if (cols[k] >= BBOX_MIN_CELLS) {
        if (s.x0 === n) s.x0 = k;
        s.x1 = k;
      }
    }
  }

  function copy(from: Shape, to: Shape): void {
    to.alive = from.alive;
    to.x0 = from.x0;
    to.y0 = from.y0;
    to.x1 = from.x1;
    to.y1 = from.y1;
    to.occ.set(from.occ);
    to.green.set(from.green);
  }

  /** L1 distance of the block signatures, as a fraction of the baseline's totals. */
  function distance(a: Shape, b: Shape): number {
    let d = 0;
    let total = 0;
    for (let k = 0; k < GRID * GRID; k++) {
      d += Math.abs(a.occ[k] - b.occ[k]) + Math.abs(a.green[k] - b.green[k]);
      total += baseline.occ[k] + baseline.green[k];
    }
    return total > 0 ? d / total : 1;
  }

  function iou(a: Shape, b: Shape): number {
    if (a.alive === 0 || b.alive === 0) return 0;
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;
    const inter = w > 0 && h > 0 ? w * h : 0;
    const area = (s: Shape) => (s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1);
    return inter / (area(a) + area(b) - inter);
  }

  /** Whether a settled frame looks like the grown monogram. */
  function looksGrown(s: Shape): boolean {
    return (
      Math.abs(s.alive - baseline.alive) <= ALIVE_TOLERANCE * baseline.alive &&
      iou(s, baseline) >= MIN_BBOX_IOU &&
      distance(s, baseline) <= MAX_SHAPE_DISTANCE
    );
  }

  function isStill(s: Shape): boolean {
    return (
      Math.abs(s.alive - anchor.alive) <= STILL_ALIVE * baseline.alive &&
      Math.abs(s.x0 - anchor.x0) <= STILL_EDGE &&
      Math.abs(s.x1 - anchor.x1) <= STILL_EDGE &&
      Math.abs(s.y0 - anchor.y0) <= STILL_EDGE &&
      Math.abs(s.y1 - anchor.y1) <= STILL_EDGE &&
      distance(s, anchor) <= STILL_SHAPE
    );
  }

  /** Starts watching from the current frame. */
  function watch(): void {
    settled = false;
    stillFor = 0;
    overFor = 0;
    since = 0;
    measure(anchor);
  }

  /** Re-seeds from a single cell and lets it grow visibly. */
  function regrow(): void {
    healer.regrows++;
    ca.seed();
    watch();
  }

  const healer = {
    /** Regrows since creation, from damage or from a wrong settle. */
    regrows: 0,
    /** Grid side, in cells. */
    size: n,
    /** The RGBA buffer (premultiplied, 0..1, row-major) of the last measured frame. */
    rgba,
    /** Alive cells in the last measured frame. */
    get alive(): number {
      return now.alive;
    },

    /** The last frame against the grown baseline: what the shape check looks at. */
    stats() {
      return { alive: now.alive / baseline.alive, iou: iou(now, baseline), distance: distance(now, baseline) };
    },

    /** Seeds and grows out of sight to the finished monogram, and records it as the baseline. */
    grow(): void {
      ca.seed();
      ca.step(grownSteps);
      measure(baseline);
      copy(baseline, now);
      settled = true;
      autoRegrows = 0;
    },

    /** Seeds and grows visibly (Reset). Not counted as a regrow. */
    restart(): void {
      autoRegrows = 0;
      ca.seed();
      watch();
      copy(anchor, now);
    },

    /** Erases brush stamps; regrows from one cell if too little is left to heal from. */
    damage(points: { x: number; y: number }[], r: number): 'healing' | 'regrowing' {
      for (const p of points) ca.damage(p.x, p.y, r);
      autoRegrows = 0;
      measure(now);
      if (now.alive < minAliveFraction * baseline.alive) {
        regrow();
        copy(anchor, now);
        return 'regrowing';
      }
      watch();
      return 'healing';
    },

    /** Runs `n` steps (none once settled) and reports where the pattern stands. */
    step(steps = 1): HealerStatus {
      if (settled) return 'settled';
      ca.step(steps);
      since += steps;
      measure(now);
      if (now.alive === 0) {
        regrow(); // everything died: start over rather than show an empty box
        copy(anchor, now);
        return 'regrowing';
      }
      if (isStill(now)) stillFor += steps;
      else {
        copy(now, anchor);
        stillFor = 0;
      }
      overFor = now.alive > OVERGROWN * baseline.alive ? overFor + steps : 0;
      const capped = since >= maxSteps;
      if (stillFor < settleWindow && overFor < settleWindow && !capped) return 'running';
      if (overFor < settleWindow && (looksGrown(now) || autoRegrows >= MAX_AUTO_REGROWS)) {
        settled = true;
        return 'settled';
      }
      // A still shape that looks wrong may be a slow heal (a 55% loss takes ~2000 steps),
      // so it gets a longer look before it is given up on.
      if (stillFor < wrongWindow && overFor < settleWindow && !capped) return 'running';
      if (autoRegrows >= MAX_AUTO_REGROWS) {
        settled = true;
        return 'settled';
      }
      autoRegrows++;
      regrow();
      copy(anchor, now);
      return 'regrowing';
    },
  };
  return healer;
}

export type Healer = ReturnType<typeof createHealer>;
