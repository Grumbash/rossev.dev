// Sharing a quote from a post page. A selection of a few words gets a small bar: QUOTE CARD draws
// a 1080×1350 image in the site's style (the native share sheet where there is one, a download
// elsewhere), LINK TO HERE copies the post url with a text fragment (#:~:text=…) the browser
// scrolls to and highlights. Copying a passage pastes it with the post title and that link.
// The words, the title and the url are data-quote-* on the post's <article>, rendered in the page's
// language; the language morph updates them like any attribute, so nothing here tracks the language.
import { copyText } from './clipboard';
import { track } from './analytics';
import { SIDE, creature } from '../data/creature';

export const CARD = {
  w: 1080,
  h: 1350,
  pad: 96,
  textWidth: 1080 - 2 * 96,
  textTop: 330,
  textHeight: 700,
  lineHeight: 1.18,
  maxPx: 76,
  minPx: 40,
  maxChars: 280,
};

const words = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
// encodeURIComponent leaves `-` alone, and a text fragment reads it as a separator.
const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D');

/** `#:~:text=…` for a passage: the whole of a short one, the first and last four words of a long one. */
export function textFragment(text: string) {
  const w = words(text);
  return `#:~:text=${w.length <= 8 ? enc(w.join(' ')) : `${enc(w.slice(0, 4).join(' '))},${enc(w.slice(-4).join(' '))}`}`;
}

// A passage from the plain version (the depth dial's "for people") is only on the page in that version:
// ?depth=plain opens it there (scripts/depth.ts).
export const quoteLink = (pageUrl: string, text: string, plain = false) => pageUrl.split('#')[0] + (plain ? '?depth=plain' : '') + textFragment(text);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What a copied passage pastes as: the passage, then the post title and the link to the passage. */
export function attribution(text: string, title: string, pageUrl: string, plain = false) {
  const link = quoteLink(pageUrl, text, plain);
  return { text: `${text}\n\n— ${title}\n${link}`, html: `<p>${esc(text)}</p><p>— <a href="${esc(link)}">${esc(title)}</a></p>` };
}

/** The quote's lines and size on the card: as large as fits, cut at a word with an ellipsis past it. */
export function fitQuote(text: string, measure: (s: string, px: number) => number) {
  const graphemes = (word: string) => typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word), (s) => s.segment)
    : Array.from(word);
  const w: string[] = [];
  let length = 0;
  for (const word of words(text)) {
    const next = length + (w.length ? 1 : 0) + word.length;
    if (next > CARD.maxChars) {
      if (w.length) w[w.length - 1] += '…';
      else w.push(graphemes(word).slice(0, CARD.maxChars - 1).join('') + '…');
      break;
    }
    w.push(word);
    length = next;
  }
  const wrap = (px: number, splitLongWords = false) => {
    const lines: string[] = [];
    for (const word of w) {
      const last = lines.at(-1);
      if (last && measure(last + ' ' + word, px) <= CARD.textWidth) {
        lines[lines.length - 1] = last + ' ' + word;
      } else if (splitLongWords && measure(word, px) > CARD.textWidth) {
        let chunk = '';
        for (const glyph of graphemes(word)) {
          if (chunk && measure(chunk + glyph, px) > CARD.textWidth) {
            lines.push(chunk);
            chunk = '';
          }
          chunk += glyph;
        }
        lines.push(chunk);
      } else lines.push(word);
    }
    return lines;
  };
  for (let px = CARD.maxPx; px >= CARD.minPx; px -= 2) {
    const lines = wrap(px);
    if (lines.length * px * CARD.lineHeight <= CARD.textHeight && lines.every((l) => measure(l, px) <= CARD.textWidth)) return { px, lines };
  }

  const px = CARD.minPx;
  const maxLines = Math.floor(CARD.textHeight / (px * CARD.lineHeight));
  let lines = wrap(px, true);
  while (lines.length > maxLines && w.length > 1) {
    w.pop();
    w[w.length - 1] += '…';
    lines = wrap(px, true);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
    const last = graphemes(lines[maxLines - 1]);
    while (last.length && measure(last.join('') + '…', px) > CARD.textWidth) last.pop();
    lines[maxLines - 1] = last.join('') + '…';
  }
  return { px, lines };
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

async function drawCard(text: string, title: string, url: string, slug: string, color: string): Promise<Blob | null> {
  const display = cssVar('--font-display') || 'sans-serif';
  const headline = cssVar('--font-headline') || display;
  const mono = cssVar('--font-mono') || 'monospace';
  // The web fonts load by what they are asked to draw: Cyrillic pulls in the Cyrillic faces.
  await Promise.all([
    document.fonts.load(`600 64px ${display}`, text),
    document.fonts.load(`800 180px ${headline}`, '“'),
    document.fonts.load(`700 30px ${mono}`, title + url),
  ]).catch(() => {});

  const c = document.createElement('canvas');
  c.width = CARD.w;
  c.height = CARD.h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const INK = '#12151E';
  const PAPER = '#F4F0EA';
  const LIME = '#C8FF00';
  const { pad } = CARD;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, CARD.w, CARD.h);
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, CARD.w - 72, CARD.h - 72);

  // The post's creature (src/data/creature.ts) where the site's bar has its badge; on the dark card
  // its eyes are the card showing through.
  const beast = creature(slug);
  const CELL = 9;
  beast.body.forEach((on, i) => {
    if (!on) return;
    const [x, y] = [pad + (i % SIDE) * CELL, pad + Math.floor(i / SIDE) * CELL];
    ctx.fillStyle = beast.eyes.includes(i) ? INK : color;
    ctx.fillRect(x, y, CELL, CELL);
  });
  ctx.fillStyle = PAPER;
  ctx.font = `700 34px ${mono}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('GLEB ROSEV', pad + SIDE * CELL + 28, pad + (SIDE * CELL) / 2);

  const quote = fitQuote(text, (s, px) => {
    ctx.font = `600 ${px}px ${display}`;
    return ctx.measureText(s).width;
  });
  // The quote mark and the quote sit together, centred in the space between the brand and the source.
  const top = CARD.textTop + Math.max(0, (CARD.textHeight - quote.lines.length * quote.px * CARD.lineHeight) / 2);
  ctx.fillStyle = LIME;
  ctx.font = `800 180px ${headline}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('“', pad - 8, top + 40);
  ctx.fillStyle = PAPER;
  ctx.font = `600 ${quote.px}px ${display}`;
  ctx.textBaseline = 'top';
  quote.lines.forEach((l, i) => ctx.fillText(l, pad, top + i * quote.px * CARD.lineHeight));

  // The source: the post title (one line, cut to fit) and where to read it.
  const foot = CARD.h - pad - 120;
  ctx.fillStyle = LIME;
  ctx.fillRect(pad, foot, CARD.textWidth, 6);
  ctx.fillStyle = PAPER;
  ctx.font = `700 30px ${mono}`;
  let t = title;
  while (ctx.measureText(t).width > CARD.textWidth && t.length > 1) t = `${t.slice(0, -2).trimEnd()}…`;
  ctx.fillText(t, pad, foot + 30);
  ctx.fillStyle = LIME;
  ctx.fillText(url.replace(/^https?:\/\//, '').replace(/\/$/, ''), pad, foot + 76);

  return new Promise((done) => c.toBlob(done, 'image/png'));
}

export function initQuote() {
  const article = document.querySelector<HTMLElement>('article[data-quote-title]');
  if (!article) return;
  const data = () => article.dataset as DOMStringMap & { quoteTitle: string; quoteUrl: string; quoteCard: string; quoteLink: string; quoteCopied: string; quoteSlug: string };

  // The passage the reader selected inside the post, if it is one: a few words, not code.
  const passage = () => {
    const s = getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    const host = r.commonAncestorContainer instanceof Element ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    if (!host || !article.contains(host) || host.closest('pre, code, button, a.brutal-btn')) return null;
    // The range's text, not the selection's: Selection.toString() follows rendering and is empty in a
    // tab that is not painting; whitespace is normalised by the callers anyway.
    const text = r.toString().replace(/\s+/g, ' ').trim();
    return words(text).length >= 3 ? { text, rect: r.getBoundingClientRect() } : null;
  };

  // Made here, so the language morph leaves it out of its page-to-page match.
  const bar = document.createElement('div');
  bar.className = 'quote-bar';
  bar.hidden = true;
  bar.setAttribute('data-quote-bar', '');
  bar.setAttribute('data-morph-ignore', '');
  bar.setAttribute('role', 'toolbar');
  const button = (what: 'card' | 'link') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctrl-btn';
    b.dataset.quoteDo = what;
    bar.append(b);
    return b;
  };
  const cardBtn = button('card');
  const linkBtn = button('link');
  document.body.append(bar);
  // Pressing a button must not clear the selection it acts on.
  bar.addEventListener('mousedown', (e) => e.preventDefault());

  // Which version of the post is on screen: the depth dial says.
  const plain = () => !!document.querySelector('[data-depth-to="plain"][aria-pressed="true"]');
  let current: { text: string } | null = null;
  const place = () => {
    const p = passage();
    current = p;
    if (!p) return void (bar.hidden = true);
    cardBtn.textContent = data().quoteCard;
    linkBtn.textContent = data().quoteLink;
    bar.hidden = false;
    // Above the selection; below it on touch screens, where the system menu sits above.
    const below = matchMedia('(pointer: coarse)').matches || p.rect.top < 80;
    const top = window.scrollY + (below ? p.rect.bottom + 10 : p.rect.top - bar.offsetHeight - 10);
    const left = Math.max(8, Math.min(window.scrollX + p.rect.left + p.rect.width / 2 - bar.offsetWidth / 2, document.documentElement.clientWidth - bar.offsetWidth - 8));
    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
  };
  const later = () => setTimeout(place, 0);
  for (const type of ['mouseup', 'keyup', 'touchend']) document.addEventListener(type, later);
  document.addEventListener('selectionchange', () => {
    if (getSelection()?.isCollapsed) bar.hidden = true;
  });

  linkBtn.addEventListener('click', async () => {
    if (!current) return;
    const copied = await copyText(quoteLink(data().quoteUrl, current.text, plain()), data().quoteCopied);
    if (copied) track('quote_share', { kind: 'link' });
  });

  cardBtn.addEventListener('click', async () => {
    if (!current) return;
    const { text } = current;
    const { quoteTitle: title, quoteUrl: url, quoteSlug: slug } = data();
    const link = quoteLink(url, text, plain());
    // The post's colour, from its var(--…), as the canvas needs it.
    const probe = document.body.appendChild(document.createElement('span'));
    probe.style.color = article.dataset.quoteColor ?? 'var(--lime)';
    const color = getComputedStyle(probe).color;
    probe.remove();
    const blob = await drawCard(text, title, url, slug, color);
    if (!blob) return;
    const file = new File([blob], `rossev-${slug}-quote.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title, url: link });
        track('quote_share', { kind: 'card' });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Sharing was refused. Offer the card through the normal download path.
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    track('quote_share', { kind: 'card' });
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  });

  // A copied passage pastes with where it came from. Code stays exactly what was selected.
  document.addEventListener('copy', (e) => {
    const p = passage();
    if (!p || !e.clipboardData) return;
    const a = attribution(p.text, data().quoteTitle, data().quoteUrl, plain());
    e.clipboardData.setData('text/plain', a.text);
    e.clipboardData.setData('text/html', a.html);
    e.preventDefault();
  });
}
