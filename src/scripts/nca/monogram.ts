// Page side of the GR neural cellular automaton, imported by ./loader.ts once the
// block nears the viewport: starts the worker, draws the frames it sends, and turns
// pointer drags and key presses into damage. The model itself runs in ./worker.ts.
import type { FromWorker, ToWorker } from './worker';
// Inlined into this lazy chunk and injected on init: imported as a stylesheet,
// Astro would hoist it into the page's critical CSS.
import css from './monogram.css?inline';

const WEIGHTS_URL = '/nca/gr.bin';
const BRUSH = 0.12; // eraser radius as a fraction of the grid side, same as the tests
const KEY_BITE = 0.15; // a keyboard bite is one bigger stamp
const NOTICE_MS = 2500;

type Point = { x: number; y: number };

/** `track` sends the nca_interact analytics event (once per action per view). The
 * loader passes it in, so this chunk has no static dependencies and its dynamic
 * import needs no preload helper in the eager loader. */
export function initNcaMonogram(track: (action: 'erase' | 'key') => void): void {
  const section = document.querySelector<HTMLElement>('.nca-section');
  const canvas = document.getElementById('nca-canvas') as HTMLCanvasElement | null;
  const fallback = section?.querySelector('.nca-fallback');
  const notice = section?.querySelector<HTMLElement>('.nca-notice');
  const ctx = canvas?.getContext('2d');
  if (!section || !canvas || !ctx) return;
  document.head.appendChild(document.createElement('style')).textContent = css;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let worker: Worker | null = null;
  let size = canvas.width;
  let inView = false;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  // One persistent line inside the live region: a new notice replaces its text.
  const noticeLine = document.createElement('span');

  // The live region is in the page from the start (empty), so filling it is announced.
  if (notice) notice.hidden = false;

  // Over the canvas wherever the grid put it (.nca-block is the offset parent); kept
  // there on resize while the notice is up.
  function placeNotice(): void {
    if (!notice) return;
    notice.style.left = `${canvas!.offsetLeft}px`;
    notice.style.top = `${canvas!.offsetTop}px`;
    notice.style.width = `${canvas!.offsetWidth}px`;
    notice.style.height = `${canvas!.offsetHeight}px`;
  }

  function hideNotice(): void {
    noticeLine.textContent = '';
    noticeLine.remove();
    window.removeEventListener('resize', placeNotice);
  }

  /** Shows a worker notice over the canvas for a moment; screen readers hear it once. */
  function showNotice(text: string | undefined): void {
    if (!notice || !text) return;
    placeNotice();
    window.addEventListener('resize', placeNotice);
    // Cleared first and filled a moment later, so the same text again is a change a
    // screen reader announces (a clear and refill in one task can be coalesced away).
    noticeLine.textContent = '';
    if (!noticeLine.isConnected) notice.appendChild(noticeLine);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      noticeLine.textContent = text;
      noticeTimer = setTimeout(hideNotice, NOTICE_MS);
    }, 50);
  }

  const send = (msg: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(msg, transfer);
  const syncVisibility = () => send({ type: 'visible', visible: inView && !document.hidden });

  // Without the model the block would show a static GR beside copy that invites
  // damage and a dead Reset button, so take the whole section (and its landmark)
  // out of the page. The zone's "Beyond the CV" divider stays; Writing follows it.
  function fail(reason: unknown): void {
    console.warn('NCA monogram disabled:', reason);
    worker?.terminate();
    worker = null;
    watcher.disconnect();
    document.removeEventListener('visibilitychange', syncVisibility);
    section!.hidden = true;
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
      if (msg.type === 'notice') {
        showNotice(notice?.dataset.regrowing);
        return;
      }
      if (msg.size !== size) {
        size = msg.size;
        canvas!.width = canvas!.height = size;
      }
      ctx!.putImageData(new ImageData(msg.pixels, size, size), 0, 0);
      if (canvas!.hidden) {
        // The static GR in the markup holds the spot (same box) until the model's
        // first frame, which the worker grows out of sight so it already looks the same.
        canvas!.hidden = false;
        fallback?.remove(); // (the `hidden` attribute does not hide an <svg>)
      }
      send({ type: 'recycle', pixels: msg.pixels }, [msg.pixels.buffer]);
    };
    send({ type: 'init', weightsUrl: WEIGHTS_URL, reducedMotion });
    syncVisibility();
  }

  // Run only while on screen and the tab is visible.
  const watcher = new IntersectionObserver(
    (entries) => {
      inView = entries[entries.length - 1].isIntersecting;
      syncVisibility();
    },
    { threshold: 0.05 }
  );
  watcher.observe(section);
  document.addEventListener('visibilitychange', syncVisibility);
  start();

  // The Reset button's analytics come from its data-track attributes.
  document.getElementById('nca-reset')?.addEventListener('click', () => send({ type: 'reset' }));

  // Keyboard: Enter or Space takes a bite somewhere on the letters.
  canvas.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (e.repeat) return; // one bite per press, not a flood while the key is held
    const point = { x: (0.2 + Math.random() * 0.6) * size, y: (0.3 + Math.random() * 0.4) * size };
    send({ type: 'damage', points: [point], r: KEY_BITE * size });
    track('key');
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
    track('erase');
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
  // A pointerup that never arrived must not leave the canvas erasing on hover.
  canvas.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId === pointerId) endStroke();
  });

  function endStroke(): void {
    pointerId = null;
    last = null;
    pending = null;
  }
}
