// What the service worker (./sw.ts) does with a request, kept apart so tests can read it plainly.
export type Route = 'skip' | 'asset' | 'page';

/**
 * 'asset': hashed and immutable (/_astro/, fonts), cache first. 'page': everything else of ours,
 * network first. 'skip': other origins, anything but GET, /booked/ (its query can carry a booking's
 * personal data, so it is never stored), Vercel's analytics scripts and the worker itself.
 */
export function route(url: URL, origin: string, method: string, mode: string): Route {
  if (method !== 'GET' || url.origin !== origin) return 'skip';
  const p = url.pathname;
  if (/^(\/ru)?\/booked(\/|$)/.test(p) || p.startsWith('/_vercel/') || p === '/sw.js') return 'skip';
  if (p.startsWith('/_astro/') || p.endsWith('.woff2')) return 'asset';
  return mode === 'websocket' ? 'skip' : 'page';
}

/** A page is stored by its path: no query (deep links like ?case= are the same page), no fragment. */
export const cacheKey = (url: URL) => url.origin + url.pathname;

/** The offline page in the language of the page asked for. */
export const offlinePath = (url: URL) => (/^\/ru(\/|$)/.test(url.pathname) ? '/ru/offline/' : '/offline/');

// A post page: /writing/<slug>/ or /ru/writing/<slug>/. The topic pages (/writing/ai/) and
// /writing/page/<n>/ share the first shape, so they are not posts: they are never saved as read
// articles or listed on the offline page. lang narrows it to one language. The worker is built with
// no bundler (astro.config.mjs), so the topics are spelled out here; tests/offline.test.ts keeps them
// equal to TOPICS in src/data/writing-pages.ts.
const NOT_POSTS = new Set(['ai', 'leadership', 'systems', 'delivery', 'page']);
export function isPostPath(path: string, lang?: 'en' | 'ru'): boolean {
  const m = path.match(/^(\/ru)?\/writing\/([a-z0-9-]+)\/$/);
  if (!m || NOT_POSTS.has(m[2])) return false;
  return lang === undefined || (lang === 'ru') === Boolean(m[1]);
}
