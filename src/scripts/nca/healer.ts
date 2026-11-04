// Recovery guard for the GR automaton. The model heals bites and cuts, but cells only
// see their neighbours: from a thin strip of survivors it cannot tell where G and R
// were, and it settles into a wrong stable shape (a long bar) or, with weaker weights,
// regrows one letter as the other. The healer watches the pattern through cheap stats
// read off the RGBA buffer and compares them with the GR training target's signature
// (./baseline.ts, generated: the page does not ship the target image). When too little
// is left, or the pattern does not end up as GR, it regrows it honestly from a single
// cell. It also decides when the pattern has stopped changing, so the worker's loop
// runs exactly as long as healing takes instead of a fixed budget.
// Thresholds are measured on public/nca/gr.bin and scripts/nca/gr-round1.bin; see
// tests/nca-regrow.test.ts and tests/nca-baseline.test.ts.
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
  /** Steps a silent grow takes. */
  grownSteps?: number;
  /** After damage, fewer alive cells than this fraction of the baseline regrows at once. */
  minAliveFraction?: number;
  /** Steps without change before a pattern that looks grown counts as settled. */
  settleWindow?: number;
  /** Steps after damage by which a heal must look grown, or it is given up and regrown.
   * Bites and cuts look grown by ~200; losses that never heal (top 50–60% kept) are
   * still far off at 400 and stay that way. */
  healDeadline?: number;
  /** The same for a growth from one cell (a regrow or Reset), which takes longer. */
  growDeadline?: number;
}

/** Coarse signature of a frame: alive count and, per block of a GRID×GRID grid, its
 * alive cells and its green mass (the R sits on a lime block, the G is black). */
export interface Shape {
  alive: number;
  occ: ArrayLike<number> & { [k: number]: number };
  green: ArrayLike<number> & { [k: number]: number };
}

/** 8×8 blocks of 7×7 cells. Measured on 640 frames (400 grows, 240 heals): every clean one
 * (MSE < 0.002) is within distance 0.045 of the target and every crooked one (MSE >
 * 0.005) is at 0.049 or more. 4×4 blocks overlapped (0.042 vs 0.033) and needed a bbox
 * check on top, whose trimmed edges swing on clean GRs. */
export const GRID = 8;

/** Signature of a premultiplied RGBA frame (`size`×`size`, row-major), written into `s`.
 * A cell is alive when its alpha is above `aliveThreshold`, as in the model. The same
 * function makes the shipped GR baseline from the training target (scripts/nca/gen-baseline.ts). */
export function measureShape(rgba: ArrayLike<number>, size: number, aliveThreshold: number, s: Shape = emptyShape()): Shape {
  s.alive = 0;
  for (let k = 0; k < GRID * GRID; k++) s.occ[k] = s.green[k] = 0;
  for (let y = 0; y < size; y++) {
    const row = Math.floor((y * GRID) / size) * GRID;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (rgba[i + 3] <= aliveThreshold) continue;
      s.alive++;
      const k = row + Math.floor((x * GRID) / size);
      s.occ[k]++;
      s.green[k] += rgba[i + 1];
    }
  }
  return s;
}

export function emptyShape(): Shape {
  return { alive: 0, occ: new Float64Array(GRID * GRID), green: new Float64Array(GRID * GRID) };
}

// Settling: a frame within these of the window's anchor frame counts as unchanged. A still
// GR jitters (cells fire at random) by up to 1.4% in alive count and 0.014 in distance.
const STILL_ALIVE = 0.02; // of the target alive count
const STILL_SHAPE = 0.025; // signature distance, see `distance`
// "Looks grown": within these of the target (see GRID for the distance calibration).
const ALIVE_TOLERANCE = 0.15;
const MAX_SHAPE_DISTANCE = 0.047;
/** A heal that looks grown at its deadline but is still changing gets this many more steps
 * to come to rest before it is judged again; settling it mid-change froze half-healed
 * frames on screen (MSE 0.007 that would have reached 0.0003). */
const DEADLINE_GRACE = 400;
/** Silent grows retried when one comes out crooked (~4% of grows): the first grow is out of
 * sight behind the static GR, so the page simply never starts from a crooked monogram. */
const SILENT_GROW_RETRIES = 3;
/** A silent grow must be this close to the target, stricter than a heal: starting a little
 * off (MSE ~0.004 at 0.045) leaves no room for the jitter later heals add. ~9% of grows are
 * retried for it, about 0.7 s each out of sight. */
const GROWN_MAX_DISTANCE = 0.04;
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

  let settled = true;
  let growing = false; // growing from one cell (a regrow or Reset), not healing
  let quiet = false; // the growth came from Reset: its retries are not announced
  let stillFor = 0; // steps the current frame has matched the anchor
  let since = 0; // steps since the last damage or growth started
  let autoRegrows = 0;

  /** Reads the CA into `rgba` and its signature into `s`. */
  function measure(s: Shape): void {
    ca.rgba(rgba);
    measureShape(rgba, n, aliveThreshold, s);
  }

  function copy(from: Shape, to: Shape): void {
    to.alive = from.alive;
    for (let k = 0; k < GRID * GRID; k++) {
      to.occ[k] = from.occ[k];
      to.green[k] = from.green[k];
    }
  }

  /** L1 distance of the block signatures, as a fraction of the target's totals. Cell
   * counts and green mass add up on one scale: a lime cell has green ≈ 1 and a black one
   * ≈ 0, so the green term is a count of lime cells. A G turned into a lime-backed R moves
   * the green term; a letter changing shape or place moves the counts. */
  function distance(a: Shape, b: Shape): number {
    let d = 0;
    let total = 0;
    for (let k = 0; k < GRID * GRID; k++) {
      d += Math.abs(a.occ[k] - b.occ[k]) + Math.abs(a.green[k] - b.green[k]);
      total += target.occ[k] + target.green[k];
    }
    return total > 0 ? d / total : 1;
  }

  /** Whether a frame looks like the grown GR. */
  function looksGrown(s: Shape, maxDistance = MAX_SHAPE_DISTANCE): boolean {
    return Math.abs(s.alive - target.alive) <= ALIVE_TOLERANCE * target.alive && distance(s, target) <= maxDistance;
  }

  function isStill(s: Shape): boolean {
    return Math.abs(s.alive - anchor.alive) <= STILL_ALIVE * target.alive && distance(s, anchor) <= STILL_SHAPE;
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
    return 'settled';
  }

  const healer = {
    /** Regrows since creation, from damage or from a wrong shape. Silent grows don't count. */
    regrows: 0,
    /** Grows the last grow() took (1 + silent retries). */
    growTries: 0,
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
      return { alive: now.alive / target.alive, distance: distance(now, target) };
    },

    /** Seeds and grows out of sight to the finished monogram, again if it came out crooked. */
    grow(): void {
      for (let tries = 1; ; tries++) {
        ca.seed();
        ca.step(grownSteps);
        measure(now);
        healer.growTries = tries;
        if (looksGrown(now, GROWN_MAX_DISTANCE) || tries > SILENT_GROW_RETRIES) break;
      }
      autoRegrows = 0;
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
      const deadline = growing ? growDeadline : healDeadline;
      // Settles only once it has stopped changing. At the deadline a shape that does not
      // look grown is regrown; one that does but is still changing gets DEADLINE_GRACE more
      // steps to come to rest, and is settled as it is only after that.
      if (grown && (stillFor >= settleWindow || since >= deadline + DEADLINE_GRACE)) return settle();
      if (since < deadline || grown) return 'running';
      if (autoRegrows >= MAX_AUTO_REGROWS) return settle(); // give up: leave it as it is
      autoRegrows++;
      regrow();
      return quiet ? 'running' : 'regrowing';
    },
  };
  return healer;
}

export type Healer = ReturnType<typeof createHealer>;
