// Global helpers every page's markup calls from onclick: theme, URL params, clipboard; and the
// language links, which carry the current ?query and #anchor over to the other locale's page.
// The no-flash theme bootstrap stays inline in Base.astro's <head>; this runs as a module.
declare global {
  interface Window {
    toggleSiteTheme: () => void;
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

  window.toggleSiteTheme = () => {
    const next = (root.getAttribute('data-theme') || 'light') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('rosev_theme', next);
    } catch {}
  };

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
