// Sharing a quote from a post. Select a few words on a post page and a small bar offers
// QUOTE CARD (a 1080×1350 image in the site's style: the quote, the post title, rossev.dev) and
// LINK TO HERE (the post url with a text fragment, #:~:text=…, which the browser scrolls to and
// highlights: no ids on paragraphs needed). Copying a passage from a post pastes it with the post
// title and the same link under it. The bar's words come from data-quote-* on the article, which
// the language morph updates like any attribute, so the bar follows EN↔RU without its own code.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BLOG_POSTS } from '../src/data/posts';
import { EVENTS } from '../src/scripts/analytics';
import { CARD, attribution, fitQuote, quoteLink, textFragment } from '../src/scripts/quote';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

describe('the link to a passage', () => {
  test('a short passage is the whole fragment, encoded the way the spec wants (- , & too)', () => {
    expect(textFragment('a well-formed JSON, fast & loud')).toBe('#:~:text=a%20well%2Dformed%20JSON%2C%20fast%20%26%20loud');
  });

  test('a long one is its first and last words, so the link stays short and survives small edits', () => {
    const long = 'Every pixel runs the same network and only sees its neighbours. Nowhere at runtime is there a picture of GR.';
    expect(textFragment(long)).toBe('#:~:text=Every%20pixel%20runs%20the,a%20picture%20of%20GR.');
  });

  test('whitespace is what the reader sees: newlines and runs of spaces become one space', () => {
    expect(textFragment('  two\n\n  lines  ')).toBe('#:~:text=two%20lines');
  });

  test('a passage of the plain version links to that version: ?depth=plain before the fragment', () => {
    expect(quoteLink('https://rossev.dev/writing/x/', 'two words here')).toBe('https://rossev.dev/writing/x/#:~:text=two%20words%20here');
    expect(quoteLink('https://rossev.dev/writing/x/', 'two words here', true)).toBe('https://rossev.dev/writing/x/?depth=plain#:~:text=two%20words%20here');
    expect(attribution('two words here', 'T', 'https://rossev.dev/writing/x/', true).text).toContain('?depth=plain#:~:text=');
  });

  test('Russian is percent-encoded; the link replaces any fragment the page url had', () => {
    expect(quoteLink('https://rossev.dev/ru/writing/x/#top', 'логотип заживает')).toBe(
      `https://rossev.dev/ru/writing/x/#:~:text=${encodeURIComponent('логотип заживает')}`,
    );
  });
});

describe('copying a passage', () => {
  test('pastes as the passage, then the post title and the link to that passage', () => {
    const a = attribution('fixed a bug', 'My Logo Heals Itself', 'https://rossev.dev/writing/x/');
    expect(a.text).toBe(`fixed a bug\n\n— My Logo Heals Itself\nhttps://rossev.dev/writing/x/${textFragment('fixed a bug')}`);
    expect(a.html).toBe(`<p>fixed a bug</p><p>— <a href="https://rossev.dev/writing/x/${textFragment('fixed a bug')}">My Logo Heals Itself</a></p>`);
  });

  test('the html is escaped: a passage can hold < > & "', () => {
    expect(attribution('a <b> & "c"', 'T & U', 'https://rossev.dev/').html).toContain('<p>a &lt;b&gt; &amp; &quot;c&quot;</p>');
  });
});

describe('the card layout', () => {
  // A monospace stand-in for canvas measureText: 0.5em per character.
  const measure = (s: string, px: number) => s.length * px * 0.5;

  test('a short quote is set large, a long one smaller, and every line fits the card', () => {
    const short = fitQuote('Nobody bites a logo.', measure);
    const long = fitQuote('A local model can’t recover information that isn’t there. Give it a dumb global supervisor that knows when it lost the plot and restarts it honestly.', measure);
    expect(short.px).toBeGreaterThan(long.px);
    for (const f of [short, long]) for (const l of f.lines) expect(measure(l, f.px)).toBeLessThanOrEqual(CARD.textWidth);
    expect(long.lines.join(' ')).toContain('restarts it honestly.');
  });

  test('past the card a quote is cut at a word with an ellipsis, never mid-word', () => {
    const f = fitQuote('word '.repeat(200).trim(), measure);
    const text = f.lines.join(' ');
    expect(text.endsWith('…')).toBe(true);
    expect(text).toMatch(/word…$/);
    expect(f.lines.length * f.px * CARD.lineHeight).toBeLessThanOrEqual(CARD.textHeight);
  });
});

describe('the page', () => {
  const page = (lang: 'en' | 'ru', slug: string) => readFileSync(`dist/${lang === 'ru' ? 'ru/' : ''}writing/${slug}/index.html`, 'utf8');
  const attr = (html: string, name: string) => html.match(new RegExp(`<article[^>]*\\b${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  test('every post page carries the post title, its url and the bar words in its language', () => {
    for (const p of BLOG_POSTS)
      for (const lang of ['en', 'ru'] as const) {
        const html = page(lang, p.slug);
        const q = { en, ru }[lang].quote;
        expect(attr(html, 'data-quote-title'), `${lang} ${p.slug}`).toBe(p.title[lang]);
        expect(attr(html, 'data-quote-url')).toBe(`https://rossev.dev${lang === 'ru' ? '/ru' : ''}/writing/${p.slug}/`);
        expect(attr(html, 'data-quote-card')).toBe(q.card);
        expect(attr(html, 'data-quote-link')).toBe(q.link);
        expect(attr(html, 'data-quote-copied')).toBe(q.copied);
      }
  });

  test('home has no quote bar: it is for reading a post', () => {
    expect(readFileSync('dist/index.html', 'utf8')).not.toContain('data-quote-title');
  });

  test('sharing is a funnel event: quote_share with what was shared', () => {
    expect(EVENTS.quote_share).toEqual(['kind']);
    expect(readFileSync('README.md', 'utf8')).toContain('`quote_share`');
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const POST = 'self-healing-monogram';

  const PROBE = () => `<script>(async () => { try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms = 8000) => { for (let t = 0; t < ms && !f(); t += 50) await wait(50); return f(); };
    const report = (o) => { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); };
    const out = {};
    // What the page would hand to the clipboard and to the download, captured instead.
    let clip = null, saved = null;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { clip = t; } }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) saved = { href: this.href, name: this.download }; else click.call(this); };
    await until(() => document.readyState === 'complete');
    // Select the first sentence of the second paragraph of the post.
    const select = () => {
      const p = document.querySelectorAll('.post-body > p')[1];
      const node = p.firstChild, text = node.textContent, end = text.indexOf('.') + 1;
      const r = document.createRange(); r.setStart(node, 0); r.setEnd(node, end);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return text.slice(0, end);
    };
    const bar = () => document.querySelector('[data-quote-bar]');
    out.selected = select();
    await until(() => bar() && !bar().hidden);
    out.bar = { shown: !!bar() && !bar().hidden, words: [...bar().querySelectorAll('button')].map((b) => b.textContent.trim()), ignored: bar().hasAttribute('data-morph-ignore') };
    out.shares = [];
    window.umami = { track: (name, props) => { if (name === 'quote_share') out.shares.push(props.kind); } };
    bar().querySelector('[data-quote-do="link"]').click();
    await until(() => clip);
    out.link = clip;
    out.linkSuccess = document.getElementById('brutal-toast').textContent;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }, configurable: true });
    bar().querySelector('[data-quote-do="link"]').click();
    await wait(0);
    out.linkDenied = document.getElementById('brutal-toast').textContent;
    const dt = new DataTransfer();
    document.querySelector('.post-body').dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: dt }));
    out.copied = { text: dt.getData('text/plain'), html: dt.getData('text/html') };
    select(); await until(() => bar() && !bar().hidden);
    bar().querySelector('[data-quote-do="card"]').click();
    await until(() => saved);
    out.card = { name: saved?.name };
    // The size from an <img>, raced against a timer: a decode that never settles must not hang the probe.
    if (saved) {
      const img = new Image();
      await Promise.race([new Promise((r) => { img.onload = img.onerror = r; img.src = saved.href; }), wait(3000)]);
      out.card.w = img.naturalWidth; out.card.h = img.naturalHeight;
    }
    // After the language morph the bar speaks Russian: its words come from the article's attributes.
    getSelection().removeAllRanges();
    document.querySelector('a[data-lang-switch]').click();
    await until(() => document.documentElement.lang === 'ru' && !document.querySelector('[style*="view-transition"]'));
    select(); await until(() => bar() && !bar().hidden);
    out.ru = [...bar().querySelectorAll('button')].map((b) => b.textContent.trim());
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.querySelector('[data-action="copy"]').click();
    await wait(0);
    out.clipboardMissing = document.getElementById('brutal-toast').textContent;
    report(out);
    } catch (e) {
      const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre);
    }
  })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('select, link, copy, card, and the bar follows the language', async () => {
    const r = await srv.run(`/writing/${POST}/`, 'share');
    const host = /^http:\/\/localhost:\d+/;
    expect(r.bar).toEqual({ shown: true, words: [en.quote.card, en.quote.link], ignored: true });
    expect(r.link.replace(host, 'https://rossev.dev')).toBe(quoteLink(`https://rossev.dev/writing/${POST}/`, r.selected));
    expect(r.linkSuccess).toBe(en.quote.copied);
    expect(r.linkDenied).toBe(en.toast.copyFailed);
    expect(r.shares).toEqual(['link', 'card']);
    expect(r.clipboardMissing).toBe(ru.toast.copyFailed);
    expect(r.copied.text).toContain(`${r.selected}\n\n— ${BLOG_POSTS.find((p) => p.slug === POST)!.title.en}\n`);
    expect(r.copied.text).toContain(textFragment(r.selected));
    expect(r.copied.html).toContain('<a href=');
    expect(r.card).toEqual({ name: `rossev-${POST}-quote.png`, w: 1080, h: 1350 });
    expect(r.ru).toEqual([ru.quote.card, ru.quote.link]);
  });
});
