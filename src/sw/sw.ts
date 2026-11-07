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

const postPath = /^\/(?:ru\/)?writing\/[a-z0-9-]+\/$/;

// Astro emits fingerprinted assets in one directory. Resolve both the /_astro/ URLs in
// a document and relative imports inside its modules. Each asset is visited at most once.
async function keepPostAssets(page: Response, assets: Cache, fetchMissing: boolean, signal?: AbortSignal, seen = new Set<string>()) {
  const walk = async (content: string, module: boolean): Promise<void> => {
    // Fetch only eager entry points and static imports. During migration, also follow dynamic
    // imports and CSS font URLs if their files already exist in an older cache.
    let pattern = /(?:["'`(](?:\.\/|(?:\/)?_astro\/))([\w.-]+\.(?:js|css|woff2))(?=["'`)])/g;
    if (fetchMissing) {
      pattern = module
        ? /(?:\bfrom|\bimport|@import)\s*["'](?:\.\/|\/_astro\/)([\w.-]+\.(?:js|css))["']/g
        : /\b(?:src|href)=["']\/_astro\/([\w.-]+\.(?:js|css|woff2))["']/g;
    }
    const refs = content.matchAll(pattern);
    await Promise.all([...refs].map(async ([, file]) => {
      const path = '/_astro/' + file;
      if (seen.has(path)) return;
      seen.add(path);
      let response = await assets.match(path);
      if (!response) {
        response = await caches.match(path);
        if (!response && fetchMissing) {
          response = await fetch(path, { redirect: 'error', referrerPolicy: 'no-referrer', signal });
          if (response.status !== 200 || response.type !== 'basic') throw new Error('Unavailable article asset');
        }
        if (!response) return; // An earlier build may never have downloaded an optional chunk.
        await assets.put(path, response.clone());
      }
      if (/\.(?:css|js)$/.test(file)) await walk(await response.text(), true);
    }));
  };
  await walk(await page.text(), false);
}

// Commit article HTML only with the assets it actually references. On deployment the live tab
// can still be displaying the previous build, so its resource timings cannot describe this HTML.
async function storePost(path: string, page: Response, signal: AbortSignal) {
  const [pages, assets] = await Promise.all([caches.open(PAGES), caches.open(ASSETS)]);
  await keepPostAssets(page.clone(), assets, true, signal);
  await pages.put(path, page);
}

async function keepFirstPost(client: WindowClient) {
  const url = new URL(client.url);
  if (url.origin !== self.location.origin || !postPath.test(url.pathname)) return;
  const signal = AbortSignal.timeout(SLOW_MS);
  const page = await fetch(url.pathname, { redirect: 'error', referrerPolicy: 'no-referrer', signal });
  if (page.status === 200 && page.type === 'basic' && page.headers.get('content-type')?.includes('text/html')) {
    await storePost(url.pathname, page, signal);
  }
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const retired = (await caches.keys()).filter((name) => name.startsWith('rossev-assets-') && name !== ASSETS);
      if (retired.length) {
        // Unopened saved articles may still reference older hashes. Copy their existing asset
        // graphs into this cache before retiring the previous cache, without fetching old URLs.
        const [pages, assets] = await Promise.all([caches.open(PAGES), caches.open(ASSETS)]);
        const posts = (await pages.keys()).filter((r) => postPath.test(new URL(r.url).pathname));
        const copied = new Set<string>();
        for (const post of posts) {
          const page = await pages.match(post);
          if (page) await keepPostAssets(page, assets, false, undefined, copied);
        }
        await Promise.all(retired.map((name) => caches.delete(name)));
      }
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.allSettled(windows.map(keepFirstPost));
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
    if (res.ok && res.type === 'basic' && !res.redirected) {
      const saving = postPath.test(url.pathname) && res.headers.get('content-type')?.includes('text/html')
        ? storePost(key, res.clone(), AbortSignal.timeout(SLOW_MS))
        : cache.put(key, res.clone());
      e.waitUntil(saving.catch(() => {}));
    }
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
