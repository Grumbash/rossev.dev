// The eager part of the post-page GR companion (./nca/companion.ts): wait until the reader starts
// reading, the first scroll with the post on screen, then import the companion. A visitor who opens a
// post and leaves gets no worker and no model; the companion grows with the reading anyway, so
// before the first scroll there is nothing for it to show. Never on Save-Data or 2G
// (./nca/should-load.ts), and without JS there is simply no companion.
import { shouldLoadNca } from './nca/should-load';
import { loadCompanion } from './nca/load-companion';
import { readBefore } from './reading';

export function initCompanionLoader() {
  const body = document.querySelector('.post-body');
  const slug = document.querySelector<HTMLElement>('article[data-quote-slug]')?.dataset.quoteSlug;
  if (!body || !slug || !shouldLoadNca(navigator)) return;
  // Read now, before this visit's first scroll: the reading memory keeps where the reader stopped,
  // and scrolling here overwrites it while the companion is still loading.
  const before = readBefore(slug);
  const start = () => {
    const r = body.getBoundingClientRect();
    if (r.top > innerHeight || r.bottom < 0) return;
    removeEventListener('scroll', start);
    loadCompanion().then((m) => m.initCompanion(slug, before), () => {});
  };
  addEventListener('scroll', start, { passive: true });
}
