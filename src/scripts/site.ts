// Global helpers every page's markup calls from onclick: language, theme, URL params, clipboard.
// The no-flash theme/language bootstrap stays inline in Base.astro's <head>; this runs as a module.
declare global {
  interface Window {
    setSiteLang: (lang: 'en' | 'ru') => void;
    toggleSiteTheme: () => void;
    setUrlParam: (key: string, val: string | null | undefined) => void;
    copyToClipboard: (text: string, label?: string) => void;
  }
}

const syncLangButtons = (lang: string) => {
  document.getElementById('btn-lang-en')?.classList.toggle('active-lang', lang === 'en');
  document.getElementById('btn-lang-ru')?.classList.toggle('active-lang', lang === 'ru');
};

export function initSite() {
  const root = document.documentElement;

  window.setSiteLang = (lang) => {
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang);
    try {
      localStorage.setItem('rosev_lang', lang);
    } catch {}
    syncLangButtons(lang);
    window.updateIsoHudText?.();
  };

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
    const ru = root.getAttribute('data-lang') === 'ru';
    navigator.clipboard?.writeText(text).catch(() => {});
    const toast = document.getElementById('brutal-toast');
    if (!toast) return;
    toast.textContent = (ru ? 'Скопировано: ' : 'Copied: ') + (label || text);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  };

  syncLangButtons(root.getAttribute('data-lang') || 'en');
}
