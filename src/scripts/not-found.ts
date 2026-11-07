// The 404 page's script. Vercel serves one /404.html for every path, so the page picks its language
// here, shows the missed path in its fake test run, and first of all rescues the commonest miss: a
// path typed with the Russian layout on (/с for /c, /ршку/ for /hire/). Then it suggests the closest
// real page and takes a bite out of the GR monogram, which heals while the visitor reads.
import { initTheme } from './theme';
import type { NcaMonogram } from './nca/monogram';

// Not imported from ./nca/loader on purpose: a module shared with the home page's script would be
// split into its own chunk, and the home page's eager monogram loader must stay in its one script.
// The same rule as there: no model on Save-Data, 2G or prefers-reduced-data; the static GR stays.
function ncaAllowed(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData || c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g') return false;
  return !matchMedia('(prefers-reduced-data: reduce)').matches;
}

// ЙЦУКЕН keys and the Latin characters on the same keys.
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const KEYS = new Map<string, string>();
for (let i = 0; i < RU.length; i++) {
  KEYS.set(RU[i], EN[i]);
  KEYS.set(RU[i].toUpperCase(), EN[i].toUpperCase());
}

// The path the same keys spell in the Latin layout, or null when there is no Cyrillic to fix.
// A fixed path has no Cyrillic left, so a second miss lands on the plain 404, never in a loop.
export function latinLayoutPath(path: string): string | null {
  if (![...path].some((ch) => KEYS.has(ch))) return null;
  return [...path].map((ch) => KEYS.get(ch) ?? ch).join('');
}

// Edit distance where swapping two neighbours (hier → hire) counts as one edit, like one typo.
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

// '/ru/Hier/' -> ['/ru', 'hier']: the locale prefix, and the rest lower-cased without edge slashes.
function splitRoute(path: string): [string, string] {
  const ru = /^\/ru(?=\/|$)/.test(path);
  return [ru ? '/ru' : '', (ru ? path.slice(3) : path).toLowerCase().replace(/^\/+|\/+$/g, '')];
}

// The real page closest to a missed path, in the same language, or null when none is close: at most
// one typo per three characters of the page's path, so a stray /wp-admin/ suggests nothing.
export function suggestPath(path: string, routes: readonly string[]): string | null {
  const [prefix, key] = splitRoute(path);
  if (!key) return null;
  // A route key is at most as long as its full path. Even the longest possible match
  // would need one deletion per extra character, beyond the most typos we accept.
  const longest = routes.reduce((length, route) => Math.max(length, route.length), 0);
  if (key.length > longest + Math.max(1, Math.floor(longest / 3))) return null;
  let best: string | null = null;
  let bestKey = '';
  let bestD = Infinity;
  for (const route of routes) {
    const [p, k] = splitRoute(route);
    if (p !== prefix || !k) continue;
    const d = distance(key, k);
    if (d < bestD || (d === bestD && k.length < bestKey.length)) [best, bestKey, bestD] = [route, k, d];
  }
  return best && bestD <= Math.max(1, Math.floor(bestKey.length / 3)) ? best : null;
}

function suggest(path: string): void {
  fetch('/routes.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((routes: string[]) => {
      const to = suggestPath(path, routes);
      if (!to) return;
      for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-suggest-link]')) {
        a.href = to;
        a.textContent = to;
      }
      for (const el of document.querySelectorAll<HTMLElement>('[data-suggest]')) el.hidden = false;
    })
    .catch(() => {});
}

// The monogram grows out of sight; once its first frame is up, a slash through both letters, and it heals.
function healMonogram(): void {
  const canvas = document.getElementById('nca-canvas');
  if (!canvas || !ncaAllowed()) return;
  // Lazy, like on home: the worker, weights and drawing code load only on this page and only now.
  import('./nca/monogram').then((m) => {
    const nca: NcaMonogram | undefined = m.initNcaMonogram(() => {});
    if (!nca) return;
    const cut = () => setTimeout(() => nca.cut({ x: 0.18, y: 0.36 }, { x: 0.82, y: 0.66 }), 700);
    if (!canvas.hidden) return cut();
    new MutationObserver((_, o) => {
      if (canvas.hidden) return;
      o.disconnect();
      cut();
    }).observe(canvas, { attributes: true, attributeFilter: ['hidden'] });
  }, () => {});
}

// Only repair a path on this site. Decoding the path can expose a leading // or backslash.
export function layoutRedirect(url: URL): URL | null {
  try {
    const fixed = latinLayoutPath(decodeURIComponent(url.pathname));
    if (!fixed) return null;
    const dest = new URL(fixed, url);
    if (dest.origin !== url.origin) return null;
    dest.search = url.search;
    dest.hash = url.hash;
    return dest;
  } catch {
    return null;
  }
}

export function initNotFound() {
  const fixed = layoutRedirect(new URL(location.href));
  if (fixed) {
    location.replace(fixed.href);
    return;
  }
  let path = location.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {}

  initTheme();

  const ru = path.startsWith('/ru/') || (!path.startsWith('/ru') && navigator.language.toLowerCase().startsWith('ru'));
  const lang = ru ? 'ru' : 'en';
  document.documentElement.lang = lang;
  const copy = document.querySelector<HTMLElement>(`[data-title][data-lang="${lang}"]`)!.dataset;
  document.title = copy.title!;
  document.getElementById('nca-canvas')!.setAttribute('aria-label', copy.healLabel!);
  document.querySelector<HTMLElement>('.nca-notice')!.dataset.regrowing = copy.regrowing;
  for (const el of document.querySelectorAll<HTMLElement>('[data-lang]')) el.hidden = el.dataset.lang !== lang;
  for (const el of document.querySelectorAll('[data-path]')) el.textContent = path;
  suggest(path);
  healMonogram();
}
