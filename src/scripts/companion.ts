// The eager part of the post-page GR companion (./nca/companion.ts): wait until the post itself is
// reached, then import the companion. Never on Save-Data or 2G (./nca/loader.ts's rule), and without
// IntersectionObserver or JS there is simply no companion.
import { shouldLoadNca } from './nca/should-load';
import { loadCompanion } from './nca/load-companion';
import { readBefore } from './reading';

export function initCompanionLoader() {
  const body = document.querySelector('.post-body');
  const slug = document.querySelector<HTMLElement>('article[data-quote-slug]')?.dataset.quoteSlug;
  if (!body || !slug || typeof IntersectionObserver === 'undefined' || !shouldLoadNca(navigator)) return;
  // Read now, before this visit's first scroll: the reading memory keeps where the reader stopped,
  // and scrolling here overwrites it while the companion is still loading.
  const before = readBefore(slug);
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    loadCompanion().then((m) => m.initCompanion(slug, before), () => {});
  });
  io.observe(body);
}
