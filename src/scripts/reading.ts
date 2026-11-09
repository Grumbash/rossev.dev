// The site remembers what you read, in this browser only (localStorage rosev_reading; no analytics,
// no server). A post page records how far the reader got: the share of the post above the reading
// line, a quarter down the screen, where the language morph and the depth dial keep the reader too.
// Back on a post started but not finished, a pill offers YOU STOPPED AT 42% ↓; the page itself
// never moves. Lists tag their cards READ ✓ or 42% READ. The words are data-reading-* attributes
// rendered in the page's language, which the language morph updates like any other.
const KEY = 'rosev_reading';
/** Past this share a post counts as read; below MIN it was only a glance. */
export const DONE = 0.9;
export const MIN = 0.08;
/** Posts kept: the most recently read. */
export const CAP = 100;

export type Entry = { f: number; t: number; d?: 1 };
export type Store = Record<string, Entry>;

/** The store with `slug` read up to `f` at `t`. Once read, a post stays read. */
export function record(store: Store, slug: string, f: number, t: number): Store {
  const share = Math.min(1, Math.max(0, f));
  const done = share >= DONE || store[slug]?.d;
  const next: Store = { ...store, [slug]: { f: share, t, ...(done ? { d: 1 as const } : {}) } };
  const keys = Object.keys(next);
  if (keys.length <= CAP) return next;
  return Object.fromEntries(keys.sort((a, b) => next[b].t - next[a].t).slice(0, CAP).map((k) => [k, next[k]]));
}

/** A card's tag: 'read', the percent read, or nothing for a glance. */
export const badge = (e?: Entry): 'read' | number | null => (!e ? null : e.d ? 'read' : e.f >= MIN ? Math.round(e.f * 100) : null);

/** The percent to offer continuing from, when the post was started and not finished. */
export const offer = (e?: Entry): number | null => (e && !e.d && e.f >= MIN && e.f < DONE ? Math.round(e.f * 100) : null);

/** The share of `slug` read before, 0 for a post not opened. */
export const readBefore = (slug: string) => load()[slug]?.f ?? 0;

const load = (): Store => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
};
const save = (s: Store) => {
  try {
    if (Object.keys(s).length) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
};

const line = () => innerHeight * 0.25;

/** How far into `body` the reading line is: 0 above it, 1 past its end. */
export function shareRead(body: Element) {
  const blocks = [...body.children];
  if (!blocks.length) return 0;
  const y = line();
  const box = body.getBoundingClientRect();
  if (box.top > y) return 0;
  if (box.bottom <= y) return 1;
  const i = blocks.findIndex((b) => b.getBoundingClientRect().bottom > y);
  if (i < 0) return 1;
  const r = blocks[i].getBoundingClientRect();
  const within = r.height ? Math.min(1, Math.max(0, (y - r.top) / r.height)) : 0;
  return (i + within) / blocks.length;
}

/** On a post page: record progress, and offer to continue where the reader stopped. */
export function initReading() {
  const article = document.querySelector<HTMLElement>('article[data-quote-slug]');
  const slug = article?.dataset.quoteSlug;
  const body = () => document.querySelector('.post-body');
  if (!article || !slug || !body()) return;

  const offered = offer(load()[slug]);
  if (offered !== null) {
    // Made here, so the language morph leaves it out of its page-to-page match.
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'reading-pill ctrl-btn';
    pill.setAttribute('data-reading-pill', '');
    pill.setAttribute('data-morph-ignore', '');
    const label = () => (pill.textContent = (article.dataset.readingContinue ?? '').replace('{n}', String(offered)));
    label();
    document.addEventListener('site:lang', label);
    document.body.append(pill);
    pill.addEventListener('click', () => {
      pill.hidden = true;
      const blocks = [...(body()?.children ?? [])];
      const target = blocks[Math.min(blocks.length - 1, Math.floor((offered / 100) * blocks.length))] as HTMLElement | undefined;
      if (!target) return;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollBy({ top: target.getBoundingClientRect().top - line(), behavior: still ? 'instant' : 'smooth' });
      target.setAttribute('data-reading-mark', article.dataset.readingHere ?? '');
      setTimeout(() => target.removeAttribute('data-reading-mark'), 4000);
    });
    // Reading on past the spot makes the offer moot.
    addEventListener('scroll', () => {
      const b = body();
      if (b && shareRead(b) * 100 >= offered) pill.hidden = true;
    }, { passive: true });
  }

  let last = -1;
  let scrolled = false;
  const keep = () => {
    // Leaving a reopened post without scrolling must preserve the offered bookmark.
    if (offered !== null && !scrolled) return;
    const b = body();
    if (!b) return;
    const f = Math.round(shareRead(b) * 1000) / 1000;
    if (f === last) return;
    last = f;
    save(record(load(), slug, f, Math.floor(Date.now() / 1000)));
  };
  let timer = 0;
  addEventListener('scroll', () => {
    scrolled = true;
    clearTimeout(timer);
    timer = window.setTimeout(keep, 400);
  }, { passive: true });
  addEventListener('pagehide', keep);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && keep());
}

/** On a list of posts (/writing/, home): tag read and started cards; /writing/ offers to forget. */
export function initReadingList() {
  // Found again on every paint: home's filters swap the whole grid in.
  const gridEl = () => document.querySelector<HTMLElement>('.posts-grid[data-reading-read]');
  if (!gridEl()) return;
  const note = document.querySelector<HTMLElement>('[data-reading-note]');

  const paint = () => {
    const grid = gridEl();
    if (!grid) return;
    const store = load();
    for (const t of document.querySelectorAll('[data-reading-badge]')) t.remove();
    for (const card of grid.querySelectorAll<HTMLElement>('article.post-card[data-slug]')) {
      const b = badge(store[card.dataset.slug!]);
      if (b === null) continue;
      const tag = document.createElement('span');
      tag.className = 'brutal-tag';
      tag.setAttribute('data-reading-badge', '');
      tag.setAttribute('data-morph-ignore', '');
      tag.textContent = b === 'read' ? grid.dataset.readingRead! : grid.dataset.readingPart!.replace('{n}', String(b));
      card.querySelector('.post-top')?.append(tag);
    }
    if (note) note.hidden = !Object.keys(store).length;
  };

  document.querySelector('[data-reading-forget]')?.addEventListener('click', () => {
    save({});
    paint();
  });
  // The inline brief and the filters on home swap cards in; the language morph renames the tags.
  document.addEventListener('site:lang', paint);
  document.body.addEventListener('htmx:afterSwap', paint);
  // "Show more" on /writing/ appends the next page's cards (scripts/show-more.ts).
  document.addEventListener('site:more', paint);
  paint();
}
