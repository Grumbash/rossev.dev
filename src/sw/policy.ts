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
