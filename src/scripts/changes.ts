// What changed since the last visit, in this browser only (localStorage rosev_seen; no analytics,
// no server). The build's /changes.json lists the posts and fingerprints /hire/ and the case pages.
// A visit starts after half an hour of quiet: then the browser compares what it saw last time with
// the build, keeps the difference for this visit (sessionStorage), and remembers the build as seen.
// A returning visit with something new gets a card once, WHILE YOU WERE AWAY, and new cards on the
// lists carry NEW until the visit ends. The words are data-changes-* on the toast element, in the
// page's language, so the language morph renames them.
const KEY = 'rosev_seen';
const VISIT = 'rosev_new';
/** Quiet that ends a visit. */
export const QUIET_MS = 30 * 60 * 1000;

type Pair = { en: string; ru: string };
export type Manifest = { posts: { slug: string; title: Pair }[]; pages: Record<string, { h: string; title: Pair }> };
export type Seen = { t: number; posts: string[]; pages: Record<string, string> };
type Visit = { posts: { slug: string; title: Pair }[]; pages: { path: string; title: Pair }[]; shown: boolean };

/** New since `seen`: posts it did not have (newest first), and pages whose text changed. */
export function diff(seen: Seen, m: Manifest) {
  const known = new Set(seen.posts);
  return {
    posts: m.posts.filter((p) => !known.has(p.slug)).map((p) => p.slug),
    pages: Object.keys(m.pages).filter((p) => p in seen.pages && seen.pages[p] !== m.pages[p].h),
  };
}

export const isNewVisit = (seen: Seen | undefined, now: number) => !seen || now - seen.t > QUIET_MS;

/** "{n} new posts" in the language's plural form; a missing form falls back to `other`. */
export function plural(lang: string, n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) {
  return (forms[new Intl.PluralRules(lang).select(n)] ?? forms.other).replace('{n}', String(n));
}

const read = <T>(store: Storage, key: string): T | undefined => {
  try {
    return JSON.parse(store.getItem(key) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
};
const write = (store: Storage, key: string, v: unknown) => {
  try {
    store.setItem(key, JSON.stringify(v));
  } catch {}
};

const CARD_CSS = `.changes-card{position:fixed;left:16px;bottom:16px;z-index:58;max-width:min(420px,calc(100vw - 32px));background:var(--surface);color:var(--ink);border:var(--border-w) solid var(--border);box-shadow:var(--shadow-md);padding:14px 40px 14px 16px;font-size:.9rem;line-height:1.45}
.changes-card h2{font-family:var(--font-mono);font-size:.75rem;font-weight:700;margin:0 0 8px}
.changes-card ul{margin:4px 0 8px 18px;padding:0}.changes-card p{margin:0}
.changes-card button{position:absolute;top:6px;right:10px;background:none;border:0;font:inherit;font-size:1.1rem;cursor:pointer;color:var(--ink-muted)}`;

export async function initChanges() {
  const now = Date.now();
  const seen = read<Seen>(localStorage, KEY);
  let visit = read<Visit>(sessionStorage, VISIT);

  if (isNewVisit(seen, now) || !visit) {
    let m: Manifest;
    try {
      m = await (await fetch('/changes.json')).json();
    } catch {
      return;
    }
    // The first visit has nothing to compare with: it only remembers what it saw.
    const d = seen && isNewVisit(seen, now) ? diff(seen, m) : { posts: [], pages: [] };
    visit = {
      posts: d.posts.map((slug) => m.posts.find((p) => p.slug === slug)!),
      pages: d.pages.map((path) => ({ path, title: m.pages[path].title })),
      shown: false,
    };
    write(sessionStorage, VISIT, visit);
    write(localStorage, KEY, { t: now, posts: m.posts.map((p) => p.slug), pages: Object.fromEntries(Object.entries(m.pages).map(([p, v]) => [p, v.h])) });
  } else if (seen) write(localStorage, KEY, { ...seen, t: now });

  const v = visit;
  const words = () => document.getElementById('brutal-toast')?.dataset ?? {};
  const lang = () => (document.documentElement.lang === 'ru' ? 'ru' : 'en');
  const href = (path: string) => (lang() === 'ru' ? `/ru${path}` : path);

  // NEW on the new cards, unless the reader already opened that post (scripts/reading.ts tags it).
  const tag = () => {
    // data-changes-new, not data-changes-tag: that one is the toast's word for the tag.
    for (const t of document.querySelectorAll('[data-changes-new]')) t.remove();
    const opened = read<Record<string, unknown>>(localStorage, 'rosev_reading') ?? {};
    for (const p of v.posts) {
      if (p.slug in opened) continue;
      const top = document.querySelector(`article.post-card[data-slug="${p.slug}"] .post-top`);
      if (!top) continue;
      const t = document.createElement('span');
      t.className = 'brutal-tag';
      t.setAttribute('data-changes-new', '');
      t.setAttribute('data-morph-ignore', '');
      t.textContent = words().changesTag ?? 'NEW';
      top.append(t);
    }
  };

  let card: HTMLElement | null = null;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CARD_CSS);
  const render = () => {
    if (!card) return;
    const w = words();
    const forms = { one: w.changesPostOne, few: w.changesPostFew, many: w.changesPostMany, other: w.changesPostOther ?? '{n}' };
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const link = (path: string, text: string) => `<a class="text-link" href="${esc(href(path))}">${esc(text)}</a>`;
    const shown = v.posts.slice(0, 3);
    card.innerHTML =
      `<h2>${w.changesTitle ?? ''}</h2>` +
      (v.posts.length
        ? `<p>${plural(lang(), v.posts.length, forms)}</p><ul>${shown.map((p) => `<li>${link(`/writing/${p.slug}/`, p.title[lang()])}</li>`).join('')}` +
          (v.posts.length > shown.length ? `<li>${(w.changesMore ?? '+{n}').replace('{n}', String(v.posts.length - shown.length))}</li>` : '') +
          '</ul>'
        : '') +
      (v.pages.length ? `<p>${w.changesUpdated ?? ''} ${v.pages.map((p) => link(p.path, p.title[lang()])).join(', ')}</p>` : '') +
      `<button type="button" aria-label="${w.changesClose ?? ''}">×</button>`;
    card.querySelector('button')!.addEventListener('click', close);
  };
  const close = () => {
    card?.remove();
    card = null;
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
  };

  if (!v.shown && (v.posts.length || v.pages.length)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    card = document.createElement('aside');
    card.className = 'changes-card';
    card.setAttribute('data-changes-card', '');
    card.setAttribute('data-morph-ignore', '');
    card.setAttribute('role', 'status');
    render();
    document.body.append(card);
    v.shown = true;
    write(sessionStorage, VISIT, v);
  }

  tag();
  document.addEventListener('site:lang', () => (render(), tag()));
  document.body.addEventListener('htmx:afterSwap', tag);
}
