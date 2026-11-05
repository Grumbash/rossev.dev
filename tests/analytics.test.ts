// The funnel must be measurable: every control a visitor uses on the way to a call
// carries a stable event name, and every cal.com link says where it was clicked.
// Unit part checks the helper; markup part checks the built output, not the source.
import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { EVENTS, calUrl, eventFromDataset, track, trackOnce } from '../src/scripts/analytics';
import { buildSite } from './fixtures/build';

setDefaultTimeout(120_000);

type Tag = { tag: string; attrs: Record<string, string> };

// Opening <a>/<button> tags with their attributes; enough for Astro's static output.
function controls(html: string): Tag[] {
  const out: Tag[] = [];
  for (const m of html.matchAll(/<(a|button)\b([^>]*)>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = (a[2] ?? '').replace(/&amp;/g, '&');
    out.push({ tag: m[1], attrs });
  }
  return out;
}
const tracked = (tags: Tag[], name: string) => tags.filter((t) => t.attrs['data-track'] === name);
const values = (tags: Tag[], prop: string) => tags.map((t) => t.attrs[`data-track-${prop}`]).sort();

describe('helper', () => {
  const w = globalThis as any;
  afterEach(() => {
    delete w.window;
  });

  test('is a no-op when there is no window or no tracker', () => {
    expect(() => track('cta_book', { placement: 'hero', lang: 'en' })).not.toThrow();
    w.window = {};
    expect(() => track('cta_book', { placement: 'hero', lang: 'en' })).not.toThrow();
  });

  test('never throws even if the tracker does', () => {
    w.window = { umami: { track: () => { throw new Error('blocked'); } } };
    expect(() => track('email_copy', { placement: 'footer' })).not.toThrow();
  });

  test('sends name and props to Umami', () => {
    const calls: unknown[][] = [];
    w.window = { umami: { track: (...a: unknown[]) => calls.push(a) } };
    track('cv_download', { placement: 'hero' });
    track('toolbox_copy');
    expect(calls).toEqual([['cv_download', { placement: 'hero' }], ['toolbox_copy']]);
  });

  test('trackOnce sends a given name+props at most once per page view', () => {
    const calls: unknown[][] = [];
    w.window = { umami: { track: (...a: unknown[]) => calls.push(a) } };
    trackOnce('topology_interact', { action: 'drag' });
    trackOnce('topology_interact', { action: 'drag' });
    trackOnce('topology_interact', { action: 'xray' });
    expect(calls.length).toBe(2);
  });

  test('every event has at most 2 props', () => {
    for (const props of Object.values(EVENTS)) expect(props.length).toBeLessThanOrEqual(2);
  });

  test('eventFromDataset reads data-track / data-track-* and rejects unknown names', () => {
    expect(eventFromDataset({ track: 'post_open', trackId: 'post-3' })).toEqual({ name: 'post_open', props: { id: 'post-3' } });
    expect(eventFromDataset({ track: 'toolbox_copy' })).toEqual({ name: 'toolbox_copy', props: undefined });
    expect(eventFromDataset({ track: 'cta_bok', trackPlacement: 'nav' })).toBeNull();
    expect(eventFromDataset({})).toBeNull();
  });

  test('calUrl adds UTM with the placement', () => {
    const u = new URL(calUrl('footer'));
    expect(u.hostname).toBe('cal.com');
    expect(u.searchParams.get('utm_source')).toBe('rossev.dev');
    expect(u.searchParams.get('utm_medium')).toBe('site');
    expect(u.searchParams.get('utm_content')).toBe('footer');
  });
});

// A minimal fake DOM for initAnalytics: enough to dispatch clicks, toggles, pointer
// moves and intersections the way the browser does, and record what reaches Umami.
describe('runtime (initAnalytics)', () => {
  const g = globalThis as any;
  type L = { fn: (e: any) => void; capture: boolean };
  let calls: unknown[][];
  let docListeners: Record<string, L[]>;
  let canvasListeners: Record<string, L[]>;
  let attrs: Record<string, string>;
  let observers: { options: any; cb: (entries: any[]) => void; targets: any[] }[];

  const listen = (map: Record<string, L[]>) => (type: string, fn: any, opt?: any) =>
    (map[type] ??= []).push({ fn, capture: opt === true || !!opt?.capture });
  // `link` makes it an <a href>, so it also matches closest('a') / closest('a[href]').
  const tagged = (dataset: Record<string, string>, link = false) => {
    const e: any = {
      dataset,
      tagName: link ? 'A' : 'BUTTON',
      closest: (sel: string) => (sel === '[data-track]' || (link && /^a\b/.test(sel)) ? e : null),
    };
    return e;
  };
  // Capture listeners, then the data-action handler (registered first), then the analytics bubble listener.
  const dispatch = (type: string, event: any, onclick?: () => void) => {
    for (const l of docListeners[type] ?? []) if (l.capture) l.fn(event);
    onclick?.();
    for (const l of docListeners[type] ?? []) if (!l.capture) l.fn(event);
  };
  const click = (target: any, onclick?: () => void, extra: Record<string, unknown> = {}) =>
    dispatch('click', { type: 'click', target, button: 0, ...extra }, onclick);
  const canvas = (type: string, e: Record<string, unknown>) => {
    for (const l of canvasListeners[type] ?? []) l.fn({ type, ...e });
  };

  async function boot(search = '') {
    calls = [];
    docListeners = {};
    canvasListeners = {};
    attrs = { 'lang': 'en', 'data-theme': 'light' };
    observers = [];
    const canvasEl = { id: 'iso-arch-canvas', addEventListener: listen(canvasListeners) };
    const sections: Record<string, any> = { experience: { id: 'experience' }, writing: { id: 'writing' }, contact: { id: 'contact' } };
    g.window = { umami: { track: (...a: unknown[]) => calls.push(a) }, location: { search } };
    g.location = g.window.location;
    g.document = {
      documentElement: { getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => (attrs[k] = v) },
      addEventListener: listen(docListeners),
      getElementById: (id: string) => (id === 'iso-arch-canvas' ? canvasEl : sections[id] ?? null),
    };
    g.window.addEventListener = g.document.addEventListener;
    g.IntersectionObserver = class {
      targets: any[] = [];
      constructor(public cb: (entries: any[]) => void, public options: any = {}) {
        observers.push(this as any);
      }
      observe(t: any) { this.targets.push(t); }
      unobserve() {}
      disconnect() {}
    };
    // Fresh module per boot so trackOnce state is per page view.
    const mod = await import(`../src/scripts/analytics.ts?boot=${Math.random()}`);
    mod.initAnalytics();
  }
  afterEach(() => {
    for (const k of ['window', 'document', 'location', 'IntersectionObserver']) delete g[k];
  });

  test('theme_switch reports the theme after the toggle', async () => {
    await boot();
    click(tagged({ track: 'theme_switch' }), () => (attrs['data-theme'] = 'dark'));
    expect(calls).toEqual([['theme_switch', { to: 'dark' }]]);
  });

  test('cta_book carries placement and the page language at click time', async () => {
    await boot();
    attrs['lang'] = 'ru';
    click(tagged({ track: 'cta_book', trackPlacement: 'footer' }));
    expect(calls).toEqual([['cta_book', { placement: 'footer', lang: 'ru' }]]);
  });

  test('middle-click on a tracked link counts; right-click does not', async () => {
    await boot();
    const cta = tagged({ track: 'cta_book', trackPlacement: 'hero' }, true);
    dispatch('auxclick', { type: 'auxclick', target: cta, button: 1 });
    dispatch('auxclick', { type: 'auxclick', target: cta, button: 2 });
    expect(calls).toEqual([['cta_book', { placement: 'hero', lang: 'en' }]]);
  });

  test('middle-click on a button does nothing, so nothing is sent', async () => {
    await boot();
    for (const ds of [
      { track: 'theme_switch' },
      { track: 'email_copy', trackPlacement: 'footer' },
      { track: 'lang_switch', trackTo: 'ru' },
      { track: 'topology_interact', trackAction: 'xray' },
    ]) {
      dispatch('auxclick', { type: 'auxclick', target: tagged(ds), button: 1 });
    }
    expect(calls).toEqual([]);
    // the once-per-view slot for xray is still free
    click(tagged({ track: 'topology_interact', trackAction: 'xray' }));
    expect(calls).toEqual([['topology_interact', { action: 'xray' }]]);
  });

  test('lang_switch is not sent when the language does not change', async () => {
    await boot();
    click(tagged({ track: 'lang_switch', trackTo: 'en' }), () => (attrs['lang'] = 'en'));
    click(tagged({ track: 'lang_switch', trackTo: 'ru' }), () => (attrs['lang'] = 'ru'));
    expect(calls).toEqual([['lang_switch', { to: 'ru' }]]);
  });

  test('case_open ignores the case opened by a ?case= deep link, counts later opens', async () => {
    await boot('?case=sully');
    const toggle = (id: string, open: boolean) =>
      dispatch('toggle', { type: 'toggle', target: { id: `case-${id}`, open, classList: { contains: (c: string) => c === 'job-case' } } });
    toggle('sully', true);
    expect(calls).toEqual([]);
    toggle('sully', false);
    toggle('sully', true);
    toggle('kingpin', true);
    expect(calls).toEqual([['case_open', { id: 'sully' }], ['case_open', { id: 'kingpin' }]]);
  });

  test('section_view needs a real share of the section on screen, and fires once', async () => {
    await boot();
    expect(observers.length).toBe(1);
    const { options, cb, targets } = observers[0];
    const t = Array.isArray(options.threshold) ? Math.min(...options.threshold) : options.threshold ?? 0;
    const bottom = (options.rootMargin ?? '').trim().split(/\s+/)[2] ?? '0px';
    const shrinksViewport = /^-\d+%$/.test(bottom) && parseInt(bottom, 10) <= -20;
    expect(t >= 0.2 || shrinksViewport).toBe(true);
    expect(targets.map((x: any) => x.id).sort()).toEqual(['contact', 'experience', 'writing']);
    const exp = targets.find((x: any) => x.id === 'experience');
    cb([{ target: exp, isIntersecting: true, intersectionRatio: 0.5 }]);
    cb([{ target: exp, isIntersecting: true, intersectionRatio: 0.5 }]);
    expect(calls).toEqual([['section_view', { section: 'experience' }]]);
  });

  test('topology drag counts a real horizontal drag, not a tap or a vertical touch scroll', async () => {
    await boot();
    // tap
    canvas('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' });
    canvas('pointerup', { clientX: 100, clientY: 100, pointerType: 'mouse' });
    // vertical page scroll on a phone
    canvas('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    canvas('pointermove', { clientX: 102, clientY: 160, pointerType: 'touch' });
    canvas('pointerup', { clientX: 102, clientY: 160, pointerType: 'touch' });
    expect(calls).toEqual([]);
    // real drag, twice: sent once
    for (let i = 0; i < 2; i++) {
      canvas('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse' });
      canvas('pointermove', { clientX: 140, clientY: 104, pointerType: 'mouse' });
      canvas('pointerup', { clientX: 140, clientY: 104, pointerType: 'mouse' });
    }
    expect(calls).toEqual([['topology_interact', { action: 'drag' }]]);
  });
});

describe('built markup', () => {
  let html = '';
  let page: Tag[] = [];
  let grid: Tag[] = [];
  let reader: Tag[] = [];

  beforeAll(() => {
    buildSite();
    html = readFileSync('dist/index.html', 'utf8');
    page = controls(html);
    grid = controls(readFileSync('dist/partials/posts-all/index.html', 'utf8'));
    reader = controls(readFileSync('dist/partials/post-post-3/index.html', 'utf8'));
  });

  test('loads Umami with the site id, only on rossev.dev', () => {
    const tag = html.match(/<script[^>]*cloud\.umami\.is\/script\.js[^>]*>/)?.[0] ?? '';
    expect(tag).toContain('data-website-id="test-site-id"');
    expect(tag).toContain('data-domains="rossev.dev"');
  });

  test('case links report the case id and placement on both homepages', () => {
    for (const prefix of ['', '/ru']) {
      const home = controls(readFileSync(`dist${prefix}/index.html`, 'utf8'));
      const clicks = tracked(home, 'case_click').map(({ attrs }) => ({
        href: attrs.href,
        event: eventFromDataset({ track: attrs['data-track'], trackId: attrs['data-track-id'], trackPlacement: attrs['data-track-placement'] }),
      }));
      const expected = [['sully', 'hero'], ['sully', 'experience'], ['yagni', 'experience']];
      expect(clicks).toEqual(expected.map(([id, placement]) => ({
        href: `${prefix}/cases/${id}/`,
        event: { name: 'case_click', props: { id, placement } },
      })));
    }
  });

  test('every cal.com link carries UTM and a matching cta_book placement', () => {
    const cal = page.filter((t) => t.attrs.href?.includes('cal.com'));
    expect(cal.length).toBe(3);
    for (const t of cal) {
      const u = new URL(t.attrs.href);
      expect(u.searchParams.get('utm_source')).toBe('rossev.dev');
      expect(u.searchParams.get('utm_medium')).toBe('site');
      expect(t.attrs['data-track']).toBe('cta_book');
      expect(u.searchParams.get('utm_content')).toBe(t.attrs['data-track-placement']);
    }
    expect(values(cal, 'placement')).toEqual(['footer', 'hero', 'nav']);
  });

  test('contact controls are tracked with their placement', () => {
    expect(values(tracked(page, 'email_copy'), 'placement')).toEqual(['footer', 'hero']);
    expect(values(tracked(page, 'email_click'), 'placement')).toEqual(['footer', 'hero']);
    expect(values(tracked(page, 'cv_download'), 'placement')).toEqual(['footer', 'hero']);
    expect(values(tracked(page, 'linkedin_click'), 'placement')).toEqual(['footer', 'hero', 'writing']);
    for (const t of page.filter((t) => t.attrs.href?.startsWith('mailto:'))) expect(t.attrs['data-track']).toBe('email_click');
    for (const t of page.filter((t) => t.attrs.href?.endsWith('.pdf'))) expect(t.attrs['data-track']).toBe('cv_download');
  });

  test('toolbox, skills, language and theme are tracked', () => {
    expect(tracked(page, 'toolbox_copy').length).toBe(1);
    const skills = page.filter((t) => 'data-skill' in t.attrs);
    expect(skills.length).toBeGreaterThan(0);
    for (const t of skills) {
      expect(t.attrs['data-track']).toBe('skill_click');
      expect(t.attrs['data-track-skill']).toBe(t.attrs['data-skill']);
    }
    // EN home offers one switch, to RU (a link to /ru/); RU home has its counterpart (tests/i18n.test.ts).
    expect(values(tracked(page, 'lang_switch'), 'to')).toEqual(['ru']);
    expect(tracked(page, 'theme_switch').length).toBe(1);
  });

  test('post filters and post cards are tracked by id', () => {
    expect(values(tracked(page, 'post_filter'), 'filter')).toEqual(['ai', 'all', 'delivery', 'leadership', 'systems']);
    const opens = grid.filter((t) => t.attrs['hx-get']?.startsWith('/partials/post-'));
    expect(opens.length).toBeGreaterThan(0);
    for (const t of opens) {
      expect(t.attrs['data-track']).toBe('post_open');
      expect(`/partials/${t.attrs['data-track-id']}`).toBe(t.attrs['hx-get'].replace('post-post-', 'post-'));
    }
    // Home cards lead to the post on the site; LinkedIn is linked from the brief and the post page.
    expect(tracked(grid, 'post_linkedin').length).toBe(0);
    expect(values(tracked(reader, 'post_linkedin'), 'id')).toEqual(['post-3']);
  });

  test('every topology control is tracked with an action', () => {
    const topo = page.filter((t) => /^(setIso|triggerIso|toggleIso|resetIso|fireIso|stepIso|openDomainBlueprint)/.test(t.attrs['data-action'] ?? ''));
    expect(topo.length).toBeGreaterThan(5);
    for (const t of topo) {
      expect(t.attrs['data-track']).toBe('topology_interact');
      expect(t.attrs['data-track-action']).toMatch(/^[a-z]+$/);
    }
  });

  test('every data-track name and prop is declared in EVENTS', () => {
    for (const t of [...page, ...grid, ...reader]) {
      const name = t.attrs['data-track'];
      if (!name) continue;
      expect(Object.keys(EVENTS)).toContain(name);
      const props = Object.keys(t.attrs).filter((k) => k.startsWith('data-track-')).map((k) => k.slice('data-track-'.length));
      for (const p of props) expect(EVENTS[name as keyof typeof EVENTS] as readonly string[]).toContain(p);
    }
  });
});
