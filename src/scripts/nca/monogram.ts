// Page side of the GR neural cellular automaton: loads the worker when the block
// nears the viewport, draws the frames it sends, and turns pointer drags and
// key presses into damage. The model itself runs in ./worker.ts.
import { trackOnce } from '../analytics';
import type { FromWorker, ToWorker } from './worker';

const WEIGHTS_URL = '/nca/gr.json';
const BRUSH = 0.12; // eraser radius as a fraction of the grid side, same as the tests
const KEY_BITE = 0.15; // a keyboard bite is one bigger stamp

type Point = { x: number; y: number };

export function initNcaMonogram(): void {
  const block = document.querySelector<HTMLElement>('.nca-block');
  const canvas = document.getElementById('nca-canvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d');
  if (!block || !canvas || !ctx) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let worker: Worker | null = null;
  let size = canvas.width;
  let inView = false;

  const send = (msg: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(msg, transfer);
  const syncVisibility = () => send({ type: 'visible', visible: inView && !document.hidden });

  // Without the model the block would be a blank box with live copy and a dead
  // Reset button, so take it out of the page instead.
  function fail(reason: unknown): void {
    console.warn('NCA monogram disabled:', reason);
    worker?.terminate();
    worker = null;
    block!.hidden = true;
  }

  function start(): void {
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      fail(err);
      return;
    }
    worker.onerror = (event) => fail(event.message || 'worker error');
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const msg = event.data;
      if (msg.type === 'error') {
        fail(msg.message);
        return;
      }
      if (msg.size !== size) {
        size = msg.size;
        canvas!.width = canvas!.height = size;
      }
      ctx!.putImageData(new ImageData(msg.pixels, size, size), 0, 0);
      send({ type: 'recycle', pixels: msg.pixels }, [msg.pixels.buffer]);
    };
    send({ type: 'init', weightsUrl: WEIGHTS_URL, reducedMotion });
    syncVisibility();
  }

  // Fetch the weights and spin up the worker only once the block is close.
  const loader = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      loader.disconnect();
      start();
    },
    { rootMargin: '400px 0px' }
  );
  loader.observe(canvas);

  // Run only while on screen and the tab is visible.
  const watcher = new IntersectionObserver(
    (entries) => {
      inView = entries[entries.length - 1].isIntersecting;
      syncVisibility();
    },
    { threshold: 0.05 }
  );
  watcher.observe(canvas);
  document.addEventListener('visibilitychange', syncVisibility);

  document.getElementById('nca-reset')?.addEventListener('click', () => {
    send({ type: 'reset' });
    trackOnce('nca_interact', { action: 'reset' });
  });

  // Keyboard: Enter or Space takes a bite somewhere on the letters.
  canvas.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const point = { x: (0.2 + Math.random() * 0.6) * size, y: (0.3 + Math.random() * 0.4) * size };
    send({ type: 'damage', points: [point], r: KEY_BITE * size });
    trackOnce('nca_interact', { action: 'key' });
  });

  // Pointer erasing. Grid coordinates come from the content box: the bounding
  // rect also includes the border.
  function toGrid(e: PointerEvent): Point {
    const rect = canvas!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left - canvas!.clientLeft) / canvas!.clientWidth) * size,
      y: ((e.clientY - rect.top - canvas!.clientTop) / canvas!.clientHeight) * size,
    };
  }

  // A drag leaves a continuous trail: fill the gap between pointer events with
  // brush stamps half a radius apart.
  function eraseTo(p: Point, from: Point | null): void {
    const r = BRUSH * size;
    const points = [p];
    if (from) {
      const n = Math.floor(Math.hypot(p.x - from.x, p.y - from.y) / (r / 2));
      for (let i = 1; i < n; i++) {
        points.push({ x: from.x + ((p.x - from.x) * i) / n, y: from.y + ((p.y - from.y) * i) / n });
      }
    }
    send({ type: 'damage', points, r });
    trackOnce('nca_interact', { action: 'drag' });
  }

  // The canvas has `touch-action: pan-y`, so on touch a vertical swipe scrolls
  // the page (the browser then sends pointercancel) and only a tap or a
  // horizontal drag reaches us. Touch therefore erases nothing until the
  // gesture is known not to be a scroll: the first move, or the lift for a tap.
  let pointerId: number | null = null;
  let last: Point | null = null; // last erased point of the active stroke
  let pending: Point | null = null; // touch start not yet erased
  let startX = 0;
  let startY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || pointerId !== null) return;
    pointerId = e.pointerId;
    const p = toGrid(e);
    if (e.pointerType === 'touch') {
      pending = p;
      startX = e.clientX;
      startY = e.clientY;
    } else {
      canvas.setPointerCapture(e.pointerId);
      eraseTo(p, null);
      last = p;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    const p = toGrid(e);
    if (pending) {
      // Wait out the slop, and leave mostly-vertical motion to the scroll.
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (Math.max(dx, dy) < 8 || dy > dx) return;
      eraseTo(pending, null);
      last = pending;
      pending = null;
    }
    if (last) {
      eraseTo(p, last);
      last = p;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointerId) return;
    if (pending) eraseTo(pending, null); // a tap
    endStroke();
  });
  // The browser took the gesture over (a scroll) or lost the pointer: drop the stroke.
  canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerId === pointerId) endStroke();
  });

  function endStroke(): void {
    pointerId = null;
    last = null;
    pending = null;
  }
}
