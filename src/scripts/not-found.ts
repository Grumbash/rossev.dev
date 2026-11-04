// The 404 page's script. Vercel serves one /404.html for every path, so the page picks its language
// here, shows the missed path in its fake test run, and first of all rescues the commonest miss: a
// path typed with the Russian layout on (/с for /c, /ршку/ for /hire/).

// ЙЦУКЕН keys and the Latin characters on the same keys.
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const KEYS = new Map<string, string>();
for (let i = 0; i < RU.length; i++) {
  KEYS.set(RU[i], EN[i]);
  KEYS.set(RU[i].toUpperCase(), EN[i].toUpperCase());
}

// The path the same keys spell in the Latin layout, or null when there is no Cyrillic to fix.
// A fixed path has no Cyrillic left, so a second miss lands on the plain 404, never in a loop.
export function latinLayoutPath(path: string): string | null {
  if (![...path].some((ch) => KEYS.has(ch))) return null;
  return [...path].map((ch) => KEYS.get(ch) ?? ch).join('');
}

export function initNotFound() {
  let path = location.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {}
  const fixed = latinLayoutPath(path);
  if (fixed) {
    location.replace(fixed + location.search + location.hash);
    return;
  }

  try {
    const theme = localStorage.getItem('rosev_theme');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
  } catch {}

  const ru = path.startsWith('/ru/') || (!path.startsWith('/ru') && navigator.language.toLowerCase().startsWith('ru'));
  if (ru) {
    document.documentElement.lang = 'ru';
    document.title = document.querySelector<HTMLElement>('[data-lang="ru"]')?.dataset.title ?? document.title;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-lang]')) el.hidden = el.dataset.lang !== (ru ? 'ru' : 'en');
  for (const el of document.querySelectorAll('[data-path]')) el.textContent = path;
}
