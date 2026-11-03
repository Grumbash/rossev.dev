// The only GR-monogram code in the page's eager JavaScript. It waits until the
// block is about to scroll into view, then imports ./monogram (worker, drawing,
// pointer and keyboard code, its CSS). On Save-Data or 2G it never does: the
// static GR in the markup stays, and the caption says why it isn't alive.

// analytics.ts is already loaded by the page's other script; this adds one import line.
import { trackOnce } from '../analytics';
import { loadMonogram } from './load-monogram';

type Connection = { saveData?: boolean; effectiveType?: string };

/** False when the browser asks to save data (Save-Data header switch, or the
 * prefers-reduced-data media query where supported) or reports a 2G-class connection. */
export function shouldLoadNca(nav: Navigator): boolean {
  const c = (nav as Navigator & { connection?: Connection }).connection;
  if (c?.saveData || c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g') return false;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches);
}

export function initNcaLoader(): void {
  const section = document.querySelector<HTMLElement>('.nca-section');
  if (!section) return;
  // Removed rather than `hidden`: the Reset button's own display rule would win.
  const dropLiveCopy = () => section.querySelectorAll('[data-nca-live]').forEach((el) => el.remove());
  // Without IntersectionObserver (very old browsers) the static GR stays, as without JS.
  if (typeof IntersectionObserver === 'undefined') return dropLiveCopy();
  if (!shouldLoadNca(navigator)) {
    dropLiveCopy();
    section.querySelectorAll<HTMLElement>('[data-nca-paused]').forEach((el) => (el.hidden = false));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      loadMonogram().then(
        (m) => m.initNcaMonogram((action) => trackOnce('nca_interact', { action })),
        () => (section.hidden = true) // no model, no point showing its controls
      );
    },
    { rootMargin: '400px 0px' }
  );
  io.observe(section);
}
