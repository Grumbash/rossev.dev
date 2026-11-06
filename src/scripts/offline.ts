// Offline (src/sw/sw.ts): register the service worker, say when the network goes away, and on the
// offline page list the posts this browser has stored, in the page's language.
const PAGES = 'rossev-pages';

function toast(text: string | undefined) {
  const el = document.getElementById('brutal-toast');
  if (!el || !text) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

export function initOffline() {
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  addEventListener('offline', () => toast(document.getElementById('brutal-toast')?.dataset.offline));
}

/** The offline page: the stored posts of this language, by their own headings. */
export async function initOfflinePage() {
  const list = document.querySelector('[data-offline-list]');
  const empty = document.querySelector<HTMLElement>('[data-offline-empty]');
  if (!list || !('caches' in window)) return;
  const post = document.documentElement.lang === 'ru' ? /^\/ru\/writing\/[^/]+\/$/ : /^\/writing\/[^/]+\/$/;
  const cache = await caches.open(PAGES);
  const paths = (await cache.keys()).map((r) => new URL(r.url).pathname).filter((p) => post.test(p)).sort();
  for (const path of paths) {
    const res = await cache.match(path);
    const doc = res && new DOMParser().parseFromString(await res.text(), 'text/html');
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'text-link';
    a.href = path;
    a.textContent = doc?.querySelector('h1')?.textContent?.trim() || path;
    li.append(a);
    list.append(li);
  }
  if (empty) empty.hidden = paths.length > 0;
}
