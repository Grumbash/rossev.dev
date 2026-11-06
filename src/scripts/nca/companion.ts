// The GR companion on a post page: the home page's self-healing monogram (./worker.ts), small, in the
// bottom right corner, growing from one cell as the post is read. It grows as far as the share read
// (the reading memory's share, ../reading.ts; a post started earlier starts it that far) and
// waits; fully grown, a cursor passing over it wounds it and it heals. At night by the reader's
// clock it sleeps: dim and breathing slowly (still under reduced motion). Loaded by ../companion.ts.
import type { FromWorker, ToWorker } from './worker';
import { DONE, shareRead } from '../reading';

const WEIGHTS_URL = '/nca/gr.bin';
const GROWN_STEPS = 300; // ./worker.ts
const BRUSH = 0.1;
// Live cells after every 10 steps from the seed (the shipped weights, mean of five seeds): the GR is
// all there by step ~100, the rest of the 300 only refines it. So the share read picks the step
// at which that share of the cells is alive: half the post, half the GR.
const ALIVE_BY_10_STEPS = [1, 25, 138, 329, 472, 620, 813, 922, 984, 1016, 1034];

/** Steps to grow for `p` of the post read toward done (0–1): half read, half the cells; done, all 300. */
export function stepsFor(p: number) {
  if (p >= 1) return GROWN_STEPS;
  const want = Math.max(0, p) * ALIVE_BY_10_STEPS.at(-1)!;
  const i = ALIVE_BY_10_STEPS.findIndex((n) => n >= want);
  if (i <= 0) return 0;
  const [a, b] = [ALIVE_BY_10_STEPS[i - 1], ALIVE_BY_10_STEPS[i]];
  return Math.round(10 * (i - 1 + (want - a) / (b - a)));
}

const CSS = `.nca-companion{position:fixed;right:16px;bottom:16px;z-index:54;width:64px;height:64px;background:var(--surface);border:var(--border-w) solid var(--border);box-shadow:var(--shadow-sm);transition:opacity .6s,filter .6s}
.nca-companion canvas{display:block;width:100%;height:100%;image-rendering:pixelated;cursor:crosshair}
.nca-companion.is-asleep{opacity:.55;filter:saturate(.5) brightness(.85)}
@media (prefers-reduced-motion:no-preference){.nca-companion.is-asleep{animation:nca-breathe 4.5s ease-in-out infinite}}
@keyframes nca-breathe{50%{opacity:.8}}
@media (max-width:640px){.nca-companion{width:48px;height:48px;right:12px;bottom:12px}}`;

/** Asleep between 23:00 and 06:00 by the reader's clock. */
export const asleep = (hour: number) => hour >= 23 || hour < 6;

/** `before`: the share of this post read on an earlier visit, so the companion starts that far. */
export function initCompanion(slug: string, before = 0) {
  const body = document.querySelector('.post-body');
  if (!body) return;
  document.head.appendChild(document.createElement('style')).textContent = CSS;

  // Made here, so the language morph leaves it out of its page-to-page match.
  const box = document.createElement('div');
  box.className = 'nca-companion';
  box.setAttribute('data-nca-companion', '');
  box.setAttribute('data-morph-ignore', '');
  box.setAttribute('aria-hidden', 'true');
  box.dataset.grown = 'false';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 56;
  box.append(canvas);
  document.body.append(box);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const night = () => box.classList.toggle('is-asleep', asleep(new Date().getHours()));
  night();
  setInterval(night, 60_000);

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker, transfer: Transferable[] = []) => worker.postMessage(msg, transfer);
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type !== 'frame') return;
    ctx.putImageData(new ImageData(msg.pixels, msg.size, msg.size), 0, 0);
    send({ type: 'recycle', pixels: msg.pixels }, [msg.pixels.buffer]);
  };
  send({ type: 'init', weightsUrl: WEIGHTS_URL, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, from: 'seed' });
  const visible = () => send({ type: 'visible', visible: document.visibilityState === 'visible' });
  visible();
  document.addEventListener('visibilitychange', visible);

  // The furthest the reader has got, this visit or before; the companion grows to match.
  let share = before;
  let capped = -1;
  const follow = () => {
    share = Math.max(share, shareRead(body));
    const steps = stepsFor(share / DONE);
    if (steps === capped) return;
    capped = steps;
    send({ type: 'cap', steps });
    if (steps >= GROWN_STEPS) box.dataset.grown = 'true';
  };
  follow();
  addEventListener('scroll', follow, { passive: true });

  // Grown, it is the monogram again: a cursor passing over it wounds it. Points are grid cells, and
  // the gap between two pointer events is filled with stamps, as on home (./monogram.ts).
  const size = canvas.width;
  const radius = BRUSH * size;
  let last: { x: number; y: number } | null = null;
  canvas.addEventListener('pointermove', (e) => {
    if (box.dataset.grown !== 'true') return;
    const r = canvas.getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) / r.width) * size, y: ((e.clientY - r.top) / r.height) * size };
    const points = [p];
    if (last) {
      const n = Math.floor(Math.hypot(p.x - last.x, p.y - last.y) / (radius / 2));
      for (let i = 1; i < n; i++) points.push({ x: last.x + ((p.x - last.x) * i) / n, y: last.y + ((p.y - last.y) * i) / n });
    }
    send({ type: 'damage', points, r: radius });
    last = p;
  });
  canvas.addEventListener('pointerleave', () => (last = null));
}
