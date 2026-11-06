// A post's own creature: a small symmetric pixel organism grown from the post's slug. The same slug
// always grows the same creature, on the server (list cards, the post header, the share preview)
// and in the browser (the quote card). Not the GR model: that one grows the same GR from any seed,
// so a post's creature comes from a cellular automaton of its own, in the same spirit.
// Steps: noise in the left half, a few smoothing generations of a cave-style automaton, mirrored
// into a whole body, the largest connected part kept, two eyes set into its upper half, and the
// order in which it grows: outward from its middle, as the GR grows from one cell.
export const SIDE = 11;
const HALF = Math.ceil(SIDE / 2);

export type Creature = {
  /** Body cells, `SIDE` × `SIDE`, row by row. */
  body: boolean[];
  /** The two eye cells (indexes into `body`), mirrored. */
  eyes: [number, number];
  /** Growth step of each body cell from the middle out; -1 outside the body. */
  order: number[];
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (x: number, y: number) => y * SIDE + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIDE && y < SIDE;

function neighbours(cells: boolean[], x: number, y: number) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inside(x + dx, y + dy) && cells[at(x + dx, y + dy)]) n++;
  return n;
}

/** Cells reachable from `start` through the 4-neighbourhood, in breadth-first order. */
function reach(cells: boolean[], start: number) {
  const seen = new Map<number, number>([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const x = c % SIDE;
    const y = Math.floor(c / SIDE);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = at(nx, ny);
      if (inside(nx, ny) && cells[k] && !seen.has(k)) {
        seen.set(k, seen.get(c)! + 1);
        queue.push(k);
      }
    }
  }
  return seen;
}

function grow(rand: () => number): boolean[] {
  let cells = Array.from({ length: SIDE * SIDE }, (_, i) => {
    const x = i % SIDE;
    const y = Math.floor(i / SIDE);
    // A margin of one cell, a little denser in the middle so the body holds together.
    if (x === 0 || y === 0 || y === SIDE - 1) return false;
    return rand() < 0.42 + (x >= HALF - 2 ? 0.12 : 0);
  });
  for (let g = 0; g < 3; g++) {
    const next = cells.slice();
    for (let y = 0; y < SIDE; y++)
      for (let x = 0; x < HALF; x++) {
        const n = neighbours(cells, x, y);
        next[at(x, y)] = cells[at(x, y)] ? n >= 3 : n >= 5;
      }
    cells = next;
  }
  // Mirror the left half (and the middle column) onto the right.
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < HALF; x++) cells[at(SIDE - 1 - x, y)] = cells[at(x, y)];
  return cells;
}

/** The creature for `slug`. */
export function creature(slug: string): Creature {
  const rand = mulberry32(hash(slug));
  for (let attempt = 0; ; attempt++) {
    const cells = grow(rand);
    // The largest connected part through the middle column is the body.
    let best = new Map<number, number>();
    for (let y = 0; y < SIDE; y++) {
      const c = at(HALF - 1, y);
      if (cells[c] && !best.has(c)) {
        const r = reach(cells, c);
        if (r.size > best.size) best = r;
      }
    }
    if (best.size < 26 && attempt < 20) continue;
    const body = cells.map((_, i) => best.has(i));
    // Eyes: a mirrored pair of body cells in the upper half. Set into the body if it can be (body
    // above and on both sides), then with body above, then anywhere in the upper half.
    const spotsWhere = (ok: (x: number, y: number) => boolean) => {
      const spots: number[] = [];
      for (let y = 1; y < HALF; y++) for (let x = 1; x < HALF - 1; x++) if (body[at(x, y)] && ok(x, y)) spots.push(at(x, y));
      return spots;
    };
    const spots = [
      spotsWhere((x, y) => body[at(x, y - 1)] && body[at(x - 1, y)] && body[at(x + 1, y)]),
      spotsWhere((x, y) => body[at(x, y - 1)]),
      spotsWhere(() => true),
    ].find((list) => list.length);
    if (!spots && attempt < 20) continue;
    const spot = spots ? spots[Math.floor(rand() * spots.length)] : [...best.keys()][0];
    const eyes: [number, number] = [spot, at(SIDE - 1 - (spot % SIDE), Math.floor(spot / SIDE))];
    // Growth from the body cell nearest the middle, outward.
    let middle = -1;
    let nearest = Infinity;
    for (const k of best.keys()) {
      const d = Math.abs((k % SIDE) - (HALF - 1)) + Math.abs(Math.floor(k / SIDE) - (HALF - 1));
      if (d < nearest) [nearest, middle] = [d, k];
    }
    const steps = reach(body, middle);
    return { body, eyes, order: body.map((b, i) => (b ? steps.get(i) ?? 0 : -1)) };
  }
}

/** The body (without the eyes) and the eyes as SVG path data, one unit per cell. */
export function creaturePaths(c: Creature) {
  const cell = (i: number) => `M${i % SIDE} ${Math.floor(i / SIDE)}h1v1h-1z`;
  return {
    body: c.body.map((b, i) => (b && !c.eyes.includes(i) ? cell(i) : '')).join(''),
    eyes: c.eyes.map(cell).join(''),
  };
}
