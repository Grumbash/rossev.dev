// The funnel must be measurable: every control a visitor uses on the way to a call
// carries a stable event name, and every cal.com link says where it was clicked.
// Unit part checks the helper; markup part checks the built output, not the source.
import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { EVENTS, calUrl, eventFromDataset, track, trackOnce } from '../src/scripts/analytics';

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

describe('built markup', () => {
  let html = '';
  let page: Tag[] = [];
  let grid: Tag[] = [];
  let reader: Tag[] = [];

  beforeAll(() => {
    execSync('bun run build', { stdio: 'ignore', env: { ...process.env, PUBLIC_UMAMI_WEBSITE_ID: 'test-site-id' } });
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
    expect(values(tracked(page, 'lang_switch'), 'to')).toEqual(['en', 'ru']);
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
    expect(tracked(grid, 'post_linkedin').length).toBe(opens.length);
    expect(values(tracked(reader, 'post_linkedin'), 'id')).toEqual(['post-3']);
  });

  test('every topology control is tracked with an action', () => {
    const topo = page.filter((t) => /window\.(setIso|triggerIso|toggleIso|resetIso|fireIso|stepIso|openDomainBlueprint)/.test(t.attrs.onclick ?? ''));
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
