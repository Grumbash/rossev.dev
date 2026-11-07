// A layer for insiders. The DevTools console greets an engineer and points at /how-its-built/; ? shows
// the shortcuts; j/k go to the next/previous post (<link rel="next|prev"> on a post page), or between
// the cards of a list; Alt+click on a block opens its source on GitHub: the nearest [data-src] (a
// post's own file), else the page's .astro (<meta name="source">). Typing in a field is never a
// shortcut. The words are data-keys-* on the toast element, in the page's language.
const REPO = 'https://github.com/Grumbash/rossev.dev/blob/main/';

/** A repo path as its file on GitHub. */
export const sourceUrl = (path: string) => REPO + path.split('/').map(encodeURIComponent).join('/');

const CSS = `[data-keys]{position:fixed;inset:auto 20px 20px auto;z-index:1000;max-width:min(360px,calc(100vw - 40px));padding:16px 18px;background:var(--surface);color:var(--ink);border:var(--border-w) solid var(--border);box-shadow:var(--shadow-lg);font:14px/1.5 var(--font-mono)}
[data-keys] h2{font:800 13px/1 var(--font-mono);text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px}
[data-keys] dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0}
[data-keys] dt kbd{border:2px solid var(--border);padding:0 5px;font:700 12px var(--font-mono)}
[data-keys] dd{margin:0}`;

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function initInsiders() {
  const words = () => document.getElementById('brutal-toast')?.dataset ?? {};
  const ru = document.documentElement.lang === 'ru';
  const w = words();
  console.log(
    `%c${w.keysHello}%c\n${w.keysBuilt} https://rossev.dev${ru ? '/ru' : ''}/how-its-built/\n${w.keysHint}`,
    'font:800 14px monospace;background:#C8FF00;color:#0A0A0A;padding:2px 6px',
    'font:12px monospace',
  );

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  let panel: HTMLElement | null = null;
  const close = () => {
    panel?.remove();
    panel = null;
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
  };
  const help = () => {
    if (panel) return close();
    const k = words();
    const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const row = (keys: string[], what?: string) => `<dt>${keys.map((x) => `<kbd>${x}</kbd>`).join(' ')}</dt><dd>${esc(what)}</dd>`;
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    panel = document.createElement('aside');
    panel.setAttribute('data-keys', '');
    panel.setAttribute('data-morph-ignore', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', k.keysTitle ?? '');
    panel.innerHTML = `<h2>${esc(k.keysTitle)}</h2><dl>${row(['j', 'k'], k.keysPosts)}${row(['Alt', 'click'], k.keysSource)}${row(['?'], k.keysHelp)}${row(['Esc'], k.keysClose)}</dl>`;
    panel.addEventListener('click', close);
    document.body.append(panel);
  };

  // j/k: a post page goes to its neighbour; a list moves between its cards.
  const step = (by: 1 | -1) => {
    const rel = document.querySelector<HTMLLinkElement>(`link[rel="${by > 0 ? 'next' : 'prev'}"]`);
    if (rel) return location.assign(rel.href);
    const cards = [...document.querySelectorAll<HTMLElement>('.post-card')].filter((c) => c.offsetParent);
    if (!cards.length) return;
    const at = cards.findIndex((c) => c.contains(document.activeElement));
    const to = cards[at < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, at + by))];
    const link = to.querySelector<HTMLElement>('a[href], button');
    link?.focus({ preventScroll: true });
    to.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.key === '?') help();
    else if (e.key === 'Escape' && panel) close();
    else if (e.key === 'j' || e.key === 'k') step(e.key === 'j' ? 1 : -1);
    else return;
    e.preventDefault();
  });

  // Alt+click: the block's source, before a link or a handler can act on the click.
  document.addEventListener(
    'click',
    (e) => {
      if (!e.altKey || e.button !== 0) return;
      const src = (e.target as Element | null)?.closest?.<HTMLElement>('[data-src]')?.dataset.src ?? document.querySelector<HTMLMetaElement>('meta[name="source"]')?.content;
      if (!src) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(sourceUrl(src), '_blank', 'noopener');
    },
    true,
  );
}
