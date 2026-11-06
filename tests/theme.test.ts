// The theme follows the system unless the visitor picked one. The THEME button walks three modes:
// AUTO → the theme the system is not showing → the one it is → AUTO again, so every click but the
// last changes what is on screen, and the label says which mode is on. In AUTO the site follows the
// system live; a pick is kept in localStorage (rosev_theme) as before. The switch itself is a light
// switch: the new theme spreads in a circle from where the button was pressed (View Transitions),
// instantly under reduced motion. Its rules for ::view-transition-*(root) live in a stylesheet added
// for the switch only, so page-to-page transitions keep their crossfade and home's inline CSS stays put.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { EVENTS } from '../src/scripts/analytics';
import { nextMode } from '../src/scripts/theme';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome, probeServer } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

describe('the order of the modes', () => {
  test('on a dark system: auto, light, dark, auto', () => {
    expect([nextMode('system', true), nextMode('light', true), nextMode('dark', true)]).toEqual(['light', 'dark', 'system']);
  });

  test('on a light system: auto, dark, light, auto', () => {
    expect([nextMode('system', false), nextMode('dark', false), nextMode('light', false)]).toEqual(['dark', 'light', 'system']);
  });
});

describe('before first paint', () => {
  // The inline head script, run against a fake page: what it sets on <html>.
  const bootstrap = () => {
    const head = readFileSync('dist/index.html', 'utf8').match(/<head>([\s\S]*?)<\/head>/)![1];
    return [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('rosev_theme'))!;
  };
  const run = (stored: string | null | 'throws', systemDark: boolean) => {
    const attrs: Record<string, string> = {};
    const ctx = {
      document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
      localStorage: { getItem: () => (stored === 'throws' ? (() => { throw new Error('blocked'); })() : stored) },
      matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && systemDark }),
    };
    runInNewContext(bootstrap(), { ...ctx, window: ctx });
    return [attrs['data-theme'], attrs['data-theme-mode']];
  };

  test('nothing picked: the system decides', () => {
    expect(run(null, true)).toEqual(['dark', 'system']);
    expect(run(null, false)).toEqual(['light', 'system']);
  });

  test('a pick wins over the system, as it did before', () => {
    expect(run('light', true)).toEqual(['light', 'light']);
    expect(run('dark', false)).toEqual(['dark', 'dark']);
  });

  test('blocked storage or a stray value still follows the system', () => {
    expect(run('throws', true)).toEqual(['dark', 'system']);
    expect(run('sepia', true)).toEqual(['dark', 'system']);
  });
});

describe('the button', () => {
  const button = (path: string) => readFileSync(`dist/${path}`, 'utf8').match(/<button[^>]*id="btn-theme-toggle"[^>]*>[\s\S]*?<\/button>/)![0];
  const attr = (b: string, name: string) => b.match(new RegExp(`${name}="([^"]*)"`))?.[1];

  test('carries the three labels in the page language and says AUTO until the script knows better', () => {
    for (const [path, d] of [['index.html', en], ['ru/index.html', ru]] as const) {
      const b = button(path);
      expect(attr(b, 'data-label-system')).toBe(d.nav.themeAuto);
      expect(attr(b, 'data-label-light')).toBe(d.nav.themeLight);
      expect(attr(b, 'data-label-dark')).toBe(d.nav.themeDark);
      expect(b.replace(/<[^>]+>/g, '').trim()).toBe(d.nav.themeAuto);
    }
  });

  test('theme_switch reports the mode it switched to: system, light or dark', () => {
    expect(EVENTS.theme_switch).toEqual(['to']);
    expect(readFileSync('src/scripts/analytics.ts', 'utf8')).toContain('to: system|light|dark');
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const PROBE = () => `<script>(async () => { try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (f, ms = 8000) => { for (let t = 0; t < ms && !f(); t += 50) await wait(50); return f(); };
    const report = (o) => { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(o); document.body.appendChild(pre); };
    // Every animation the page starts on a view-transition pseudo-element, recorded.
    const seen = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, opts) { if (opts?.pseudoElement) seen.push({ on: opts.pseudoElement, clip: [].concat(frames.clipPath ?? frames.map?.((f) => f.clipPath) ?? []) }); return animate.call(this, frames, opts); };
    localStorage.removeItem('rosev_theme');
    await until(() => document.readyState === 'complete');
    const btn = () => document.getElementById('btn-theme-toggle');
    const snap = () => ({ theme: document.documentElement.dataset.theme, mode: document.documentElement.dataset.themeMode, label: btn().textContent.trim(), stored: localStorage.getItem('rosev_theme') });
    const settled = () => !document.querySelector('[style*="view-transition"]') && !document.getAnimations().some((a) => a.effect?.pseudoElement);
    const press = async () => {
      const r = btn().getBoundingClientRect(), x = Math.round(r.left + 5), y = Math.round(r.top + 5);
      seen.length = 0;
      btn().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 }));
      await wait(100); await until(settled); await wait(100);
      return { at: [x, y], ...snap(), circle: seen.find((s) => s.on === '::view-transition-new(root)')?.clip ?? null };
    };
    const out = { load: snap() };
    out.one = await press();
    out.two = await press();
    out.three = await press();
    out.one2 = await press();
    document.querySelector('a[data-lang-switch]').click();
    await until(() => document.documentElement.lang === 'ru' && settled());
    out.ru = snap();
    report(out);
  } catch (e) { const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify({ error: String(e && e.stack || e) }); document.body.appendChild(pre); } })();</script>`;

  let srv: ReturnType<typeof probeServer>;
  beforeAll(() => (srv = probeServer(PROBE)));
  afterAll(() => srv?.stop());

  test('on a dark system: AUTO is dark, then light, dark, AUTO; each change spreads from the press; the label follows the language', async () => {
    const r = await srv.run('/writing/', 'theme', ['--force-dark-mode']);
    expect(r.error).toBeUndefined();
    expect(r.load).toEqual({ theme: 'dark', mode: 'system', label: en.nav.themeAuto, stored: null });
    expect(r.one).toMatchObject({ theme: 'light', mode: 'light', label: en.nav.themeLight, stored: 'light' });
    expect(r.two).toMatchObject({ theme: 'dark', mode: 'dark', label: en.nav.themeDark, stored: 'dark' });
    expect(r.three).toMatchObject({ theme: 'dark', mode: 'system', label: en.nav.themeAuto, stored: null });
    // A light switch: a circle from the press point, from nothing to past the far corner.
    const [x, y] = r.one.at;
    expect(r.one.circle[0]).toBe(`circle(0px at ${x}px ${y}px)`);
    expect(r.one.circle.at(-1)).toMatch(new RegExp(`^circle\\(\\d+(\\.\\d+)?px at ${x}px ${y}px\\)$`));
    // Back to AUTO on a dark system shows the same dark: nothing to spread.
    expect(r.three.circle).toBeNull();
    expect(r.one2).toMatchObject({ theme: 'light', mode: 'light' });
    expect(r.ru).toMatchObject({ theme: 'light', mode: 'light', label: ru.nav.themeLight });
  });

  test('on a light system AUTO is light; under reduced motion the theme changes with no circle', async () => {
    const r = await srv.run('/writing/', 'theme', ['--force-prefers-reduced-motion']);
    expect(r.error).toBeUndefined();
    expect(r.load).toMatchObject({ theme: 'light', mode: 'system' });
    expect(r.one).toMatchObject({ theme: 'dark', mode: 'dark', circle: null });
  });
});
