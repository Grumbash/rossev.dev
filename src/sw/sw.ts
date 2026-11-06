// The service worker, served as /sw.js. astro.config.mjs bundles this file at the end of the build
// and defines PRECACHE (the shell: home, /writing/, the offline page in both languages and the
// scripts and fonts they load) and VERSION (a hash of that list and the bundle).
// Pages: network first, so the newest text always wins online; a slow network falls back to the
// stored copy after a few seconds and updates it in the background. Assets: cache first, they are
// hashed. Offline, a page never stored gets the offline page in its language.
import { cacheKey, offlinePath, route } from './policy';

declare const PRECACHE: string[];
declare const VERSION: string;
declare const self: ServiceWorkerGlobalScope;

// Pages outlive builds (a post read last month still opens offline); assets belong to one build.
const PAGES = 'rossev-pages';
const ASSETS = `rossev-assets-${VERSION}`;
const SLOW_MS = 4000;

const isPage = (path: string) => !path.startsWith('/_astro/') && !path.endsWith('.woff2');

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const [pages, assets] = await Promise.all([caches.open(PAGES), caches.open(ASSETS)]);
      await Promise.all([pages.addAll(PRECACHE.filter(isPage)), assets.addAll(PRECACHE.filter((p) => !isPage(p)))]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('rossev-assets-') && name !== ASSETS) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

async function fromCacheFirst(request: Request) {
  const cache = await caches.open(ASSETS);
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

async function fromNetworkFirst(e: FetchEvent, url: URL) {
  const cache = await caches.open(PAGES);
  const key = cacheKey(url);
  const network = fetch(e.request).then((res) => {
    // Only a whole, own, successful page is kept: no redirects, no errors, nothing opaque.
    if (res.ok && res.type === 'basic' && !res.redirected) e.waitUntil(cache.put(key, res.clone()));
    return res;
  });
  const stored = () => cache.match(key);
  const slow = new Promise<'slow'>((r) => setTimeout(() => r('slow'), SLOW_MS));
  try {
    const first = await Promise.race([network, slow]);
    if (first !== 'slow') return first;
    // Slow: the stored copy now if there is one, the network's answer when it comes otherwise.
    e.waitUntil(network.catch(() => {}));
    return (await stored()) ?? (await network);
  } catch {
    const hit = await stored();
    if (hit) return hit;
    if (e.request.mode === 'navigate') {
      const offline = await cache.match(new URL(offlinePath(url), url.origin).href);
      if (offline) return offline;
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const r = route(url, self.location.origin, e.request.method, e.request.mode);
  if (r === 'asset') e.respondWith(fromCacheFirst(e.request));
  else if (r === 'page') e.respondWith(fromNetworkFirst(e, url));
});
