// EN↔RU in place. The language link fetches this page in the other language and morphs the live
// page into it: both bodies are walked side by side, and where the structure matches (every page
// and its twin share one, tests/lang-morph.test.ts keeps it so) only text and attributes change, so
// listeners and running scripts survive. The language switch and the post body may differ between
// the languages and are swapped whole. Each changed block melts into its new text in a top-to-bottom
// wave (View Transitions), and the block being read stays where it was on the screen.
// Anything unexpected falls back to an ordinary navigation. Loaded on first reach for the switch.

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
// A <template> holds a version not on screen (the depth dial's plain text): swapped like a region.
const SWAP = '.nav-controls, .post-body, template';
// State the page's own scripts set (open, pressed, hidden…); the server's copy would undo it.
const KEEP = new Set(['class', 'style', 'id', 'hidden', 'open', 'checked', 'disabled', 'value', 'aria-expanded', 'aria-pressed', 'aria-selected', 'aria-hidden', 'data-path']);
const BLOCK = 'p, h1, h2, h3, h4, h5, li, dt, dd, blockquote, pre, figcaption, td, th, a, button, label, summary';
const MAX_NAMED = 48;

// `quiet`: an attribute only (a link's href), nothing on screen changes.
export type Change = { el: Element; apply: () => void; swap?: boolean; quiet?: boolean };

// Script-made nodes (data-morph-ignore) have no twin in the fetched page.
const kids = (el: Element) => [...el.children].filter((c) => !SKIP.has(c.tagName) && !c.hasAttribute('data-morph-ignore'));
const texts = (el: Element) => [...el.childNodes].filter((n): n is Text => n.nodeType === Node.TEXT_NODE);

/** The changes that turn `live` into `next`, or null when their structures differ. */
export function plan(live: Element, next: Element, out: Change[] = []): Change[] | null {
  if (live.tagName !== next.tagName) return null;
  for (const { name, value } of next.attributes) {
    if (!KEEP.has(name) && live.getAttribute(name) !== value) out.push({ el: live, quiet: true, apply: () => live.setAttribute(name, value) });
  }
  if (live.matches(SWAP)) {
    const html = next.innerHTML;
    if (live.innerHTML !== html) out.push({ el: live, swap: true, apply: () => (live.innerHTML = html) });
    return out;
  }
  const a = kids(live);
  const b = kids(next);
  if (a.length !== b.length) return null;
  const ta = texts(live);
  const tb = texts(next);
  if (ta.length === tb.length) {
    ta.forEach((t, i) => {
      const data = tb[i].data;
      if (t.data !== data) out.push({ el: live, apply: () => (t.data = data) });
    });
  } else if (!a.length) {
    const s = next.textContent ?? '';
    out.push({ el: live, apply: () => (live.textContent = s) });
  } else return null;
  for (let i = 0; i < a.length; i++) if (!plan(a[i], b[i], out)) return null;
  return out;
}

const pages = new Map<string, Promise<string>>();
const pathOf = (url: string) => {
  const u = new URL(url, location.href);
  return u.pathname + u.search;
};

export function prefetch(url: string) {
  const key = pathOf(url);
  if (!pages.has(key)) {
    const p = fetch(key, { credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
    p.catch(() => pages.delete(key));
    pages.set(key, p);
  }
  return pages.get(key)!;
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
};

// The block being read: the first text block under a line a quarter down the screen.
function readingAnchor(): Element | null {
  const y = innerHeight * 0.25;
  for (const el of document.elementsFromPoint(innerWidth / 2, y)) {
    const b = el.closest(BLOCK);
    if (b && !b.closest('.top-nav')) return b;
  }
  return null;
}

// The same block after the change: itself, or inside a swapped region its twin by relative position.
function follow(anchor: Element) {
  const region = anchor.closest(SWAP);
  if (!region) return () => anchor;
  const children = () => [...region.children];
  const top = children().find((c) => c.contains(anchor)) ?? anchor;
  const fraction = children().indexOf(top) / Math.max(1, children().length);
  return () => {
    const now = children();
    return now[Math.min(now.length - 1, Math.round(fraction * now.length))] ?? region;
  };
}

let busy = false;

/**
 * Apply `changes` as one melt: the changed blocks on screen dissolve into their new text in a
 * top-to-bottom wave, and the block being read stays where it was. `extra` runs inside the same
 * update, before the reader is put back (the head, history, the site:lang event).
 */
export async function melt(changes: Change[], extra?: () => void) {
  const anchor = readingAnchor();
  const before = anchor?.getBoundingClientRect().top ?? 0;
  const after = anchor ? follow(anchor) : null;

  // The blocks that melt: changed and on screen, outermost only, in document order.
  const melting: Element[] = [];
  for (const c of changes) {
    if (c.quiet) continue;
    const targets = c.swap ? [...c.el.children] : [c.el.closest(BLOCK) ?? c.el];
    for (const el of targets) {
      if (melting.length >= MAX_NAMED) break;
      if (!melting.some((m) => m.contains(el) || el.contains(m)) && visible(el)) melting.push(el);
    }
  }
  // Swapped regions get new children: they inherit the melt names by position.
  const regions = changes.filter((c) => c.swap).map((c) => ({ el: c.el, names: new Map<number, string>() }));

  const apply = () => {
    for (const c of changes) c.apply();
    extra?.();
    for (const r of regions) [...r.el.children].forEach((c, i) => r.names.has(i) && ((c as HTMLElement).style.viewTransitionName = r.names.get(i)!));
    // Instant: the site scrolls smoothly, and the reader must not see the page slide.
    if (after) scrollBy({ top: after().getBoundingClientRect().top - before, behavior: 'instant' });
  };

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || !document.startViewTransition) return apply();

  const named = melting.map((el, i) => {
    const name = `lang-morph-${i}`;
    (el as HTMLElement).style.viewTransitionName = name;
    (el as HTMLElement).style.setProperty('view-transition-class', 'lang-morph');
    const r = regions.find((r) => r.el.contains(el));
    if (r) r.names.set([...r.el.children].indexOf(el), name);
    return name;
  });
  const t = document.startViewTransition(apply);
  // A tab that paints no frames (in the background) would hold the transition open: cut it short.
  const cut = setTimeout(() => t.skipTransition(), 1500);
  const melts: Animation[] = [];
  t.finished
    .catch(() => {})
    .finally(() => {
      clearTimeout(cut);
      for (const a of melts) a.cancel();
      for (const el of document.querySelectorAll<HTMLElement>('[style*="view-transition"]')) {
        el.style.removeProperty('view-transition-name');
        el.style.removeProperty('view-transition-class');
        if (!el.getAttribute('style')) el.removeAttribute('style');
      }
    });
  t.ready
    .then(() => {
      named.forEach((name, i) => {
        const opts = { duration: 420, delay: Math.min(i * 22, 320), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' as const };
        const fade = (side: 'old' | 'new', frames: Keyframe[]) =>
          melts.push(document.documentElement.animate(frames, { ...opts, pseudoElement: `::view-transition-${side}(${name})` }));
        fade('old', [
          { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' },
          { opacity: 0, filter: 'blur(6px)', transform: 'translateY(-3px)' },
        ]);
        fade('new', [
          { opacity: 0, filter: 'blur(6px)', transform: 'translateY(3px)' },
          { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' },
        ]);
      });
    })
    .catch(() => {});
  // The page is changed once the update ran; the melt may still be playing.
  await t.updateCallbackDone;
}

/** Melt one region's content into `html` (the depth dial). */
export const meltRegion = (el: Element, html: string) => melt([{ el, swap: true, apply: () => (el.innerHTML = html) }]);

/** Morph into `url`'s page; `push` adds a history entry (false when answering Back/Forward). */
export async function morphTo(url: string, push = true) {
  if (busy) return;
  busy = true;
  const fallback = () => (push ? location.assign(url) : location.reload());
  try {
    const doc = new DOMParser().parseFromString(await prefetch(url), 'text/html');
    const changes = plan(document.body, doc.body);
    if (!changes) return fallback();
    await melt(changes, () => {
      document.title = doc.title;
      document.documentElement.lang = doc.documentElement.lang;
      for (const sel of ['meta[name="description"]', 'link[rel="canonical"]']) {
        const from = doc.head.querySelector(sel);
        const to = document.head.querySelector(sel);
        if (from && to) for (const attr of ['content', 'href']) if (from.hasAttribute(attr)) to.setAttribute(attr, from.getAttribute(attr)!);
      }
      if (push) history.pushState({ langMorph: true }, '', url);
      // Islands that hold language state follow here, inside the same update (the depth dial
      // puts the plain version back, the replay relabels its canvas).
      document.dispatchEvent(new CustomEvent('site:lang', { detail: { lang: doc.documentElement.lang } }));
    });
  } catch {
    fallback();
  } finally {
    busy = false;
  }
}
