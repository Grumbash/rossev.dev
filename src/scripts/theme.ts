// The theme: the system's (AUTO) until the visitor picks one. The THEME button walks AUTO → the theme
// the system is not showing → the one it is → AUTO, its label naming the mode. A pick is kept in
// localStorage (rosev_theme); AUTO removes it and follows the system live. The inline head script in
// Base.astro applies the same rule before first paint (data-theme, data-theme-mode on <html>).
// A press is a light switch: the new theme spreads in a circle from where the button was pressed.
export type Mode = 'system' | 'light' | 'dark';

const KEY = 'rosev_theme';
const DARK = '(prefers-color-scheme: dark)';

/** The mode after `mode` on a system that is (`systemDark`) or is not dark. */
export function nextMode(mode: Mode, systemDark: boolean): Mode {
  const same = systemDark ? 'dark' : 'light';
  const other = systemDark ? 'light' : 'dark';
  return mode === 'system' ? other : mode === other ? same : 'system';
}

// For the length of a switch only: the old page stays whole under the new one, and the new one is
// revealed by the circle alone. Page-to-page transitions keep the default crossfade.
const SWITCH_CSS = '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}';

export function initTheme() {
  const root = document.documentElement;
  const system = matchMedia(DARK);
  const mode = (): Mode => {
    const m = root.dataset.themeMode;
    return m === 'light' || m === 'dark' ? m : 'system';
  };
  const themeOf = (m: Mode) => (m === 'system' ? (system.matches ? 'dark' : 'light') : m);

  // The label comes from the button's data-label-*, in the page's language: the language morph
  // swaps the button in with the other language's labels, and site:lang names the mode again.
  const label = () => {
    const b = document.getElementById('btn-theme-toggle');
    const text = b?.dataset[`label${mode()[0].toUpperCase()}${mode().slice(1)}`];
    if (b && text) b.textContent = text;
  };

  const set = (m: Mode) => {
    root.dataset.themeMode = m;
    root.setAttribute('data-theme', themeOf(m));
    try {
      if (m === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch {}
    label();
  };

  /** Switch to `m`; from `at` (the press point) the new theme spreads in a circle. */
  const switchTo = (m: Mode, at?: { x: number; y: number }) => {
    const before = root.getAttribute('data-theme');
    if (!at || themeOf(m) === before || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return set(m);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(SWITCH_CSS);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    // The top bar is its own group for page transitions; here it switches with the rest of the page.
    const nav = document.querySelector<HTMLElement>('.top-nav');
    nav?.style.setProperty('view-transition-name', 'none');
    const t = document.startViewTransition(() => set(m));
    t.ready
      .then(() => {
        const r = Math.hypot(Math.max(at.x, innerWidth - at.x), Math.max(at.y, innerHeight - at.y));
        root.animate(
          { clipPath: [`circle(0px at ${at.x}px ${at.y}px)`, `circle(${Math.ceil(r)}px at ${at.x}px ${at.y}px)`] },
          { duration: 560, easing: 'cubic-bezier(.3,.7,.2,1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {});
    // A tab that paints no frames would hold the switch open: cut it short.
    const cut = setTimeout(() => t.skipTransition(), 1500);
    t.finished
      .catch(() => {})
      .finally(() => {
        clearTimeout(cut);
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
        nav?.style.removeProperty('view-transition-name');
        if (nav && !nav.getAttribute('style')) nav.removeAttribute('style');
      });
  };

  window.toggleSiteTheme = (e?: MouseEvent) => {
    // A keyboard press has no pointer: the circle starts from the button.
    const b = document.getElementById('btn-theme-toggle')?.getBoundingClientRect();
    const at = e && e.detail > 0 ? { x: e.clientX, y: e.clientY } : b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : undefined;
    switchTo(nextMode(mode(), system.matches), at);
  };

  // AUTO follows the system as it changes (an OS schedule, a manual switch): no circle, no press.
  system.addEventListener('change', () => mode() === 'system' && set('system'));
  document.addEventListener('site:lang', label);
  label();
}
