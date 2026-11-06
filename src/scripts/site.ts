import { initOffline } from './offline';
import { initTheme } from './theme';

// Global helpers every page's markup calls through data-action (scripts/actions.ts): theme (scripts/theme.ts), URL params, clipboard; and the
// language links, which carry the current ?query and #anchor over to the other locale's page.
// The no-flash theme bootstrap stays inline in Base.astro's <head>; this runs as a module.
declare global {
  interface Window {
    toggleSiteTheme: (e?: MouseEvent) => void;
    setUrlParam: (key: string, val: string | null | undefined) => void;
    copyToClipboard: (text: string, label?: string) => void;
  }
}

// The other locale's path plus where the visitor is on this page: ?case=yagni, #experience.
export const langSwitchHref = (path: string, search: string, hash: string) => path + search + hash;

export function initSite() {
  const root = document.documentElement;

  // Capture phase: the href is updated before the browser follows it (click, middle-click, keyboard).
  const carry = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a[data-lang-switch]') as HTMLAnchorElement | null;
    if (!a) return;
    const path = a.dataset.path ?? a.getAttribute('href')!.split(/[?#]/)[0];
    a.dataset.path = path;
    a.setAttribute('href', langSwitchHref(path, window.location.search, window.location.hash));
  };
  document.addEventListener('click', carry, true);
  document.addEventListener('auxclick', carry, true);
  // Right-click -> "Open in new tab" / "Copy link" reads the href too.
  document.addEventListener('contextmenu', carry, true);

  // A plain click morphs this page into the other language in place (scripts/lang-morph.ts, loaded
  // when the visitor first reaches for the switch); a modifier click still opens the link as is.
  const morph = () => import('./lang-morph');
  const reach = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a[data-lang-switch]') as HTMLAnchorElement | null;
    if (a) void morph().then((m) => m.prefetch(a.href)).catch(() => {});
  };
  document.addEventListener('pointerover', reach);
  document.addEventListener('focusin', reach);
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[data-lang-switch]') as HTMLAnchorElement | null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    morph()
      .then((m) => m.morphTo(a.href))
      .catch(() => window.location.assign(a.href));
  });
  // Leaving /writing/ through a card: only that card's title takes its name (--vt), so it alone flies
  // into the post heading; naming all 47 would make the browser snapshot every one of them.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const title = (e.target as Element | null)?.closest?.('a[href]')?.closest('.post-card')?.querySelector<HTMLElement>('.vt-card');
    if (title) title.style.viewTransitionName = getComputedStyle(title).getPropertyValue('--vt').trim();
  });
  // Back to this page from the post (bfcache): the name goes, or the next card would share the stage.
  window.addEventListener('pageshow', () => {
    for (const t of document.querySelectorAll<HTMLElement>('.vt-card')) t.style.removeProperty('view-transition-name');
  });

  // Back/Forward across a morph: the URL's language no longer matches the page, so morph again.
  window.addEventListener('popstate', () => {
    const lang = /^\/ru(\/|$)/.test(window.location.pathname) ? 'ru' : 'en';
    if (lang === root.lang) return;
    morph()
      .then((m) => m.morphTo(window.location.href, false))
      .catch(() => window.location.reload());
  });

  initTheme();
  initOffline();


  // Deep links for cases and posts: rewrite the query without a history entry.
  window.setUrlParam = (key, val) => {
    try {
      const url = new URL(window.location.href);
      if (val === null || val === undefined || val === '') url.searchParams.delete(key);
      else url.searchParams.set(key, val);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  window.copyToClipboard = (text, label) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    const toast = document.getElementById('brutal-toast');
    if (!toast) return;
    toast.textContent = (toast.dataset.copied ?? 'Copied: ') + (label || text);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  };
}
