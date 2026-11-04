// Recovery guard for the GR automaton. The model heals bites and cuts, but cells only
// see their neighbours: from a thin strip of survivors it cannot tell where G and R
// were, and it settles into a wrong stable shape (a long bar) or, with weaker weights,
// regrows one letter as the other. The healer watches the pattern through cheap stats
// read off the RGBA buffer and compares them with the GR training target's signature
// (./baseline.ts, a few dozen numbers: the page does not ship the target image). When
// too little is left, or the pattern does not end up as GR, it regrows it honestly
// from a single cell. It also decides when the pattern has stopped changing, so the
// worker's loop runs exactly as long as healing takes instead of a fixed budget.
// Thresholds are measured on public/nca/gr.bin and scripts/nca/gr-round1.bin; see
// tests/nca-regrow.test.ts.
import type { NeuralCA } from './model';
import { GR_BASELINE } from './baseline';

/** 'regrowing' is returned once per regrow, by the call that started it, so the page can
 * say why. Damage while a regrow is under way only damages the young pattern: no second
 * regrow, no second notice. A Reset whose growth is retried is not announced ('running'):
 * nothing was damaged, so "couldn't heal" would not be true. */
export type HealerStatus = 'running' | 'settled' | 'regrowing';

export interface HealerOptions {
  /** What "grown" looks like; defaults to the GR training target's signature. */
  baseline?: Shape & { size: number };
  /** Steps the silent first grow takes. */
  grownSteps?: number;
  /** After damage, fewer alive cells than this fraction of the baseline regrows at once. */
  minAliveFraction?: number;
  /** Steps without change before a pattern that looks grown counts as settled. */
  settleWindow?: number;
  /** Steps after damage by which a heal must look grown, or it is given up and regrown.
   * Bites and cuts look grown by ~200 (distance ≤ 0.03); losses that never heal (top
   * 50–60% kept) are still ≥ 0.05 off at 400 and stay that way. */
  healDeadline?: number;
  /** The same for a growth from one cell (a regrow or Reset), which takes longer. */
  growDeadline?: number;
}

/** Coarse signature of a frame: alive count, bounding box, and per block of a GRID×GRID
 * grid its alive cells and its green mass (the R sits on a lime block, the G is black). */
export interface Shape {
  alive: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  occ: ArrayLike<number> & { [k: number]: number };
  green: ArrayLike<number> & { [k: number]: number };
}

export const GRID = 4;
/** Rows and columns with fewer live cells than this are left out of the bounding box. */
const BBOX_MIN_CELLS = 3;

/** Signature of a premultiplied RGBA frame (`size`×`size`, row-major), written into `s`.
 * A cell is alive when its alpha is above `aliveThreshold`, as in the model. The same
 * function makes the shipped GR baseline from the training target (scripts/nca/gen-baseline.ts). */
export function measureShape(rgba: ArrayLike<number>, size: number, aliveThreshold: number, s: Shape = emptyShape(), rows = new Uint16Array(size), cols = new Uint16Array(size)): Shape {
  s.alive = 0;
  for (let k = 0; k < GRID * GRID; k++) s.occ[k] = s.green[k] = 0;
  rows.fill(0);
  cols.fill(0);
  for (let y = 0; y < size; y++) {
    const row = Math.floor((y * GRID) / size) * GRID;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (rgba[i + 3] <= aliveThreshold) continue;
      s.alive++;
      rows[y]++;
      cols[x]++;
      const k = row + Math.floor((x * GRID) / size);
      s.occ[k]++;
      s.green[k] += rgba[i + 1];
    }
  }
  // Bounding box of the rows and columns that hold a stroke: a lone live cell at the
  // edge (the model leaves one now and then) would otherwise swing it by many pixels.
  s.x0 = s.y0 = size;
  s.x1 = s.y1 = -1;
  for (let k = 0; k < size; k++) {
    if (rows[k] >= BBOX_MIN_CELLS) {
      if (s.y0 === size) s.y0 = k;
      s.y1 = k;
    }
    if (cols[k] >= BBOX_MIN_CELLS) {
      if (s.x0 === size) s.x0 = k;
      s.x1 = k;
    }
  }
  return s;
}

export function emptyShape(): Shape {
  return { alive: 0, x0: 0, y0: 0, x1: 0, y1: 0, occ: new Float64Array(GRID * GRID), green: new Float64Array(GRID * GRID) };
}
// Settling: a frame within these of the window's anchor frame counts as unchanged.
// The automaton fires cells at random, so a still GR jitters by ~±10 alive cells (1%).
const STILL_ALIVE = 0.02; // of the baseline alive count
const STILL_SHAPE = 0.04; // signature distance, see `distance`
const STILL_EDGE = 1; // px each bbox edge may wobble
// "Looks grown": close to the GR target. Measured against it on 400 grown seeds: every one
// with MSE < 0.002 has alive ratio 1.01–1.05, bbox IoU ≥ 0.90 and distance ≤ 0.035; the
// visibly crooked ones (MSE ~0.0095, the kind a heal also gets stuck in) measure 0.048–0.053.
// The distance bar sits just above the clean ones: by 0.039 a heal can be at MSE ~0.005.
const ALIVE_TOLERANCE = 0.15;
const MIN_BBOX_IOU = 0.85;
const MAX_SHAPE_DISTANCE = 0.037;
/** How close a heal of a crooked grown GR must come back to that grown frame. Heals back
 * to it measure 0.003–0.027 from it; one that went visibly worse (MSE 0.005 → 0.010)
 * measured 0.035. */
const MAX_REST_DISTANCE = 0.03;
/** Regrows started by a wrong shape in a row: a backstop, so a model that keeps failing
 * (or broken weights that never grow) stops instead of regrowing forever. */
const MAX_AUTO_REGROWS = 3;

export function createHealer(ca: NeuralCA, opts: HealerOptions = {}) {
  const aliveThreshold = ca.aliveThreshold;
  const grownSteps = opts.grownSteps ?? 300;
  const minAliveFraction = opts.minAliveFraction ?? 0.4;
  const settleWindow = opts.settleWindow ?? 200;
  const healDeadline = opts.healDeadline ?? 380;
  const growDeadline = opts.growDeadline ?? 1000;
  const n = ca.size;
  const target = opts.baseline ?? GR_BASELINE;
  if (target.size !== n) throw new Error(`healer: baseline is for a ${target.size}-cell grid, the model has ${n}`);
  if (!(target.alive > 0)) throw new Error('healer: baseline has no live cells');

  const rgba = new Float32Array(n * n * 4);
  const anchor = emptyShape(); // start of the current still window
  const now = emptyShape(); // last measured frame
  // The last state the visitor saw that the model really produced as "grown": the silent
  // first grow, or a settle that passed the target check. Never a heal accepted only by
  // resemblance to it, nor a give-up settle, so it cannot drift away from GR bite by bite.
  const rest = emptyShape();
  let restCrooked = false; // `rest` itself fails the target check (a crooked grow)
  const rows = new Uint16Array(n);
  const cols = new Uint16Array(n);

  let settled = true;
  let growing = false; // growing from one cell (a regrow or Reset), not healing
  let quiet = false; // the growth came from Reset: its retries are not announced
  let stillFor = 0; // steps the current frame has matched the anchor
  let since = 0; // steps since the last damage or growth started
  let autoRegrows = 0;

  /** Reads the CA into `rgba` and its signature into `s`. */
  function measure(s: Shape): void {
    ca.rgba(rgba);
    measureShape(rgba, n, aliveThreshold, s, rows, cols);
  }

  function copy(from: Shape, to: Shape): void {
    to.alive = from.alive;
    to.x0 = from.x0;
    to.y0 = from.y0;
    to.x1 = from.x1;
    to.y1 = from.y1;
    for (let k = 0; k < GRID * GRID; k++) {
      to.occ[k] = from.occ[k];
      to.green[k] = from.green[k];
    }
  }

  /** L1 distance of the block signatures, as a fraction of the target's totals. Cell
   * counts and green mass add up on one scale: a lime cell has green ≈ 1 and a black one
   * ≈ 0, so the green term is a count of lime cells. A G turned into a lime-backed R moves
   * the green term; a letter changing shape moves the counts. */
  function distance(a: Shape, b: Shape): number {
    let d = 0;
    let total = 0;
    for (let k = 0; k < GRID * GRID; k++) {
      d += Math.abs(a.occ[k] - b.occ[k]) + Math.abs(a.green[k] - b.green[k]);
      total += target.occ[k] + target.green[k];
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

  function like(s: Shape, ref: Shape, maxDistance = MAX_SHAPE_DISTANCE): boolean {
    return (
      Math.abs(s.alive - ref.alive) <= ALIVE_TOLERANCE * target.alive &&
      iou(s, ref) >= MIN_BBOX_IOU &&
      distance(s, ref) <= maxDistance
    );
  }

  /** Whether a frame looks grown: like the GR target. One exception: a monogram that grew
   * a little crooked (MSE ~0.009, ~4% of grows) and is bitten may heal back to that same
   * crooked state, a heal rather than a reason to throw it away. That reference is the
   * grown frame itself and never moves while it is crooked (see `rest`), so it cannot
   * ratchet; when the monogram is a clean GR, only the target counts. */
  function looksGrown(s: Shape): boolean {
    return like(s, target) || (!growing && restCrooked && like(s, rest, MAX_REST_DISTANCE));
  }

  function isStill(s: Shape): boolean {
    return (
      Math.abs(s.alive - anchor.alive) <= STILL_ALIVE * target.alive &&
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
    since = 0;
    measure(anchor);
    copy(anchor, now);
  }

  /** Re-seeds from a single cell and lets it grow visibly. */
  function regrow(): void {
    healer.regrows++;
    growing = true;
    ca.seed();
    watch();
  }

  function settle(): HealerStatus {
    settled = true;
    growing = quiet = false;
    if (like(now, target)) {
      copy(now, rest);
      restCrooked = false;
    }
    return 'settled';
  }

  const healer = {
    /** Regrows since creation, from damage or from a wrong shape. */
    regrows: 0,
    /** Grid side, in cells. */
    size: n,
    /** The RGBA buffer (premultiplied, 0..1, row-major) of the last measured frame. */
    rgba,
    /** Alive cells in the last measured frame. */
    get alive(): number {
      return now.alive;
    },

    /** The last frame against the GR target: what the shape check looks at. */
    stats() {
      return { alive: now.alive / target.alive, iou: iou(now, target), distance: distance(now, target), fromRest: distance(now, rest), restIou: iou(now, rest) };
    },

    /** Seeds and grows out of sight to the finished monogram. */
    grow(): void {
      ca.seed();
      ca.step(grownSteps);
      measure(now);
      autoRegrows = 0;
      copy(now, rest); // whatever the model grew is what the visitor first sees
      restCrooked = !like(now, target);
      settle();
    },

    /** Seeds and grows visibly (Reset). Not counted as a regrow, and never announced. */
    restart(): void {
      autoRegrows = 0;
      growing = quiet = true;
      ca.seed();
      watch();
    },

    /** Erases brush stamps; regrows from one cell if too little is left to heal from.
     * During a regrow it never starts another: one gesture is one regrow, however many
     * moves it sends. */
    damage(points: { x: number; y: number }[], r: number): 'healing' | 'regrowing' {
      for (const p of points) ca.damage(p.x, p.y, r);
      autoRegrows = 0;
      quiet = false;
      measure(now);
      const tooLittle = now.alive < minAliveFraction * target.alive;
      if (!growing && tooLittle) {
        regrow();
        return 'regrowing';
      }
      // A young regrow hit while still small starts again from its seed, as part of the
      // same regrow: a scribble that goes on erasing would otherwise leave a mangled
      // sprout that grows wrong and needs a second regrow (and a second notice).
      if (growing && tooLittle) ca.seed();
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
        // Everything died: start over rather than show an empty box. During a growth that
        // is the same growth, and its deadline keeps running, so weights that never grow
        // end in a few tries instead of looping.
        if (growing) {
          ca.seed();
          return 'running';
        }
        regrow();
        return quiet ? 'running' : 'regrowing';
      }
      if (isStill(now)) stillFor += steps;
      else {
        copy(now, anchor);
        stillFor = 0;
      }
      const grown = looksGrown(now);
      const pastDeadline = since >= (growing ? growDeadline : healDeadline);
      if (grown && (stillFor >= settleWindow || pastDeadline)) return settle();
      if (!pastDeadline) return 'running';
      if (autoRegrows >= MAX_AUTO_REGROWS) return settle(); // give up: leave it as it is
      autoRegrows++;
      regrow();
      return quiet ? 'running' : 'regrowing';
    },
  };
  return healer;
}

export type Healer = ReturnType<typeof createHealer>;
