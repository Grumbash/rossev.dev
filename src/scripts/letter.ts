// A letter that knows the context, on /hire. WRITE ME AN EMAIL is a mailto: with a subject; with JS
// the letter is already started from what this browser remembers: the two posts read most recently
// (the reading memory, scripts/reading.ts; titles from /changes.json) and the offer the visitor jumped
// to (the address's #audit). A line under the button shows how it starts. Nothing leaves the browser
// until the visitor sends it from their own mail app. The words are data-letter-* on the link, in the
// page's language, so the language morph brings the other language's.
import { badge, type Store } from './reading';

export type Words = { hello: string; readOne: string; readMany: string; and: string; open: string; close: string; offer: string };

/** The start of the letter, or null when there is nothing to start it with. */
export function letter({ store, titles, offer, w }: { store: Store; titles: Record<string, string>; offer: string | null; w: Words }) {
  const read = Object.keys(store)
    .filter((slug) => titles[slug] && badge(store[slug]) !== null)
    .sort((a, b) => store[b].t - store[a].t)
    .slice(0, 2)
    .map((slug) => `${w.open}${titles[slug]}${w.close}`);
  const lines = [
    ...(read.length ? [(read.length > 1 ? w.readMany : w.readOne).replace('{posts}', read.join(w.and))] : []),
    // Mid-sentence: "interested in: AI agent…", "Интересует: аудит…"; a name in capitals (AI…) stays.
    ...(offer ? [w.offer.replace('{offer}', /^.\p{Ll}/u.test(offer) ? offer[0].toLowerCase() + offer.slice(1) : offer)] : []),
  ];
  return lines.length ? { lines, body: `${w.hello}\n\n${lines.join(' ')}\n\n` } : null;
}

export function initLetter() {
  const a = document.querySelector<HTMLAnchorElement>('[data-letter]');
  const preview = document.querySelector<HTMLElement>('[data-letter-line]');
  if (!a || !preview) return;
  const plain = a.getAttribute('href')!.split('&body=')[0];
  let posts: { slug: string; title: Record<string, string> }[] = [];

  const render = () => {
    const d = a.dataset;
    const lang = document.documentElement.lang === 'ru' ? 'ru' : 'en';
    let store: Store = {};
    try {
      store = JSON.parse(localStorage.getItem('rosev_reading') || '{}') ?? {};
    } catch {}
    const id = decodeURIComponent(location.hash.slice(1));
    const offer = (id && document.querySelector(`.hire-card[id="${CSS.escape(id)}"] h2`)?.textContent?.trim()) || null;
    const w = { hello: d.letterHello, readOne: d.letterReadOne, readMany: d.letterReadMany, and: d.letterAnd, open: d.letterOpen, close: d.letterClose, offer: d.letterOffer } as Words;
    const l = letter({ store, titles: Object.fromEntries(posts.map((p) => [p.slug, p.title[lang]])), offer, w });
    // Rebuilt from the plain link: the language morph swaps the subject in with the other words.
    const base = a.getAttribute('href')!.split('&body=')[0] || plain;
    a.setAttribute('href', l ? `${base}&body=${encodeURIComponent(l.body)}` : base);
    preview.hidden = !l;
    preview.textContent = l ? `${d.letterPreview} ${w.hello} ${l.lines.join(' ')} ${d.letterNote}` : '';
  };

  render();
  fetch('/changes.json')
    .then((r) => r.json())
    .then((m) => {
      posts = m.posts;
      render();
    })
    .catch(() => {});
  addEventListener('hashchange', render);
  document.addEventListener('site:lang', render);
}
