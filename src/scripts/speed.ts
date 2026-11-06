// The site measures itself for you: a footer line, "This page opened for you in 0.28 s", and how —
// the server's first byte, the first paint, the bytes that came over the network (or none: from this
// browser's cache). Real numbers from this visitor's Performance API: largest contentful paint, else
// first paint, else the load event. They stay on the page; nothing sends them anywhere. Back from the
// back/forward cache, the page was restored instantly. The words are data-speed-* on the line, in
// the page's language; the text is a script-made node the language morph leaves alone.
export type Timing = { lcp: number; fcp: number; ttfb: number; bytes: number };
type Words = { opened: string; server: string; paint: string; net: string; cache: string; s: string; ms: string; kb: string };

export function speedLine(t: Timing, lang: string, w: Words) {
  const secs = (ms: number) => w.s.replace('{n}', new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ms / 1000));
  return {
    main: w.opened.replace('{s}', secs(t.lcp || t.fcp)),
    detail: [
      w.server.replace('{ms}', w.ms.replace('{n}', String(Math.round(t.ttfb)))),
      w.paint.replace('{s}', secs(t.fcp)),
      t.bytes > 0 ? w.net.replace('{kb}', w.kb.replace('{n}', String(Math.max(1, Math.round(t.bytes / 1024))))) : w.cache,
    ].join(' · '),
  };
}

function measure(): Timing {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const paint = performance.getEntriesByName('first-contentful-paint')[0];
  const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  return {
    lcp: lcp?.startTime ?? 0,
    // No paint entry (a hidden tab never paints): the load event stands in.
    fcp: paint?.startTime ?? nav?.loadEventStart ?? 0,
    ttfb: nav ? nav.responseStart - nav.startTime : 0,
    bytes: (nav?.transferSize ?? 0) + resources.reduce((n, r) => n + (r.transferSize || 0), 0),
  };
}

export function initSpeed() {
  const p = document.querySelector<HTMLElement>('[data-speed]');
  if (!p) return;
  const span = document.createElement('span');
  span.setAttribute('data-morph-ignore', '');
  let restored = false;
  let timing: Timing | null = null;
  const render = () => {
    const w = p.dataset as unknown as Record<string, string>;
    if (restored) span.textContent = w.speedInstant;
    else if (timing) {
      const l = speedLine(timing, document.documentElement.lang, {
        opened: w.speedOpened, server: w.speedServer, paint: w.speedPaint, net: w.speedNet, cache: w.speedCache, s: w.speedS, ms: w.speedMs, kb: w.speedKb,
      });
      span.textContent = `${l.main} (${l.detail})`;
    } else return;
    if (!span.isConnected) p.append(span);
    p.hidden = false;
  };
  const done = () => setTimeout(() => ((timing = measure()), render()), 0);
  if (document.readyState === 'complete') done();
  else addEventListener('load', done, { once: true });
  addEventListener('pageshow', (e) => e.persisted && ((restored = true), render()));
  document.addEventListener('site:lang', render);
}
