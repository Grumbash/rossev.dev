// The hero topology must say "I solve your problem", not "I build cool things":
// three guided steps (plan → sandbox → break & heal) that end on the YAGNI case.
// Free play stays, behind "Explore". On a phone it is a still poster until Play.
// Unit part checks the step logic; markup part checks the built output; the layout
// part drives headless Chrome when it is installed.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTS } from '../src/scripts/analytics';
import { START, arrivalAction, breakAndHeal, caseVisible, go, healed } from '../src/scripts/topology-story';

setDefaultTimeout(120_000);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

describe('step logic', () => {
  test('starts on step 1, nothing broken, no case yet', () => {
    expect(START).toEqual({ step: 1, healing: false, healed: false });
    expect(caseVisible(START)).toBe(false);
  });

  test('next and back move one step and stop at the ends', () => {
    expect(go(START, -1).step).toBe(1);
    expect(go(START, 1).step).toBe(2);
    expect(go(go(START, 1), 1).step).toBe(3);
    expect(go(go(go(START, 1), 1), 1).step).toBe(3);
    expect(go(go(START, 1), -1).step).toBe(1);
  });

  test('break & heal works only on step 3, and not twice at once', () => {
    expect(breakAndHeal(START, false)).toEqual(START);
    const s3 = go(go(START, 1), 1);
    const breaking = breakAndHeal(s3, false);
    expect(breaking).toEqual({ step: 3, healing: true, healed: false });
    expect(breakAndHeal(breaking, false)).toBe(breaking);
    expect(caseVisible(breaking)).toBe(false);
  });

  test('the YAGNI case appears once the guard has healed the run', () => {
    const s3 = go(go(START, 1), 1);
    const done = healed(breakAndHeal(s3, false));
    expect(done).toEqual({ step: 3, healing: false, healed: true });
    expect(caseVisible(done)).toBe(true);
    // a heal with nothing broken changes nothing
    expect(healed(s3)).toEqual(s3);
  });

  test('under reduced motion the run is healed at once, no animation to wait for', () => {
    const done = breakAndHeal(go(go(START, 1), 1), true);
    expect(done).toEqual({ step: 3, healing: false, healed: true });
    expect(caseVisible(done)).toBe(true);
  });

  test('stepping back from step 3 resets the fault, so the story replays', () => {
    const done = healed(breakAndHeal(go(go(START, 1), 1), false));
    expect(go(done, -1)).toEqual({ step: 2, healing: false, healed: false });
  });

  test('arriving at steps 2 and 3 is a funnel event; going back or staying is not', () => {
    const s2 = go(START, 1);
    const s3 = go(s2, 1);
    expect(arrivalAction(START, s2)).toBe('step2');
    expect(arrivalAction(s2, s3)).toBe('step3');
    expect(arrivalAction(s3, s2)).toBeNull();
    expect(arrivalAction(s3, s3)).toBeNull();
  });
});

let html = '';
let card = '';
let css = '';

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Inner text of the first `.lang-xx` span after `at` in `src`.
function langAt(src: string, at: number, lang: 'en' | 'ru'): string {
  if (at < 0) return '';
  const m = src.slice(at).match(new RegExp(`<span class="lang-${lang}">([\\s\\S]*?)</span>`));
  return m ? text(m[1]) : '';
}
// The opening tag that carries `attr` (e.g. data-story-play).
const tagWith = (src: string, attr: string) => src.match(new RegExp(`<(a|button)\\b[^>]*\\b${attr}\\b[^>]*>`))?.[0] ?? '';

beforeAll(() => {
  if (!existsSync('dist/index.html') || !process.env.SKIP_BUILD) execSync('bun run build', { stdio: 'ignore' });
  html = readFileSync('dist/index.html', 'utf8');
  const start = html.indexOf('stage-iso-card');
  card = html.slice(start, html.indexOf('id="experience"', start));
  const dir = 'dist/_astro';
  css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  css += [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
});

describe('the card tells a 3-step story', () => {
  test('each step has a caption in EN and RU', () => {
    for (const step of [1, 2, 3]) {
      const at = card.search(new RegExp(`data-story-step="${step}"`));
      expect(at).toBeGreaterThan(-1);
      expect(langAt(card, at, 'en').length).toBeGreaterThan(20);
      expect(langAt(card, at, 'ru').length).toBeGreaterThan(20);
    }
  });

  test('step 3 has the break & heal action, tracked as heal', () => {
    const btn = tagWith(card, 'data-story-break');
    expect(btn).toContain('data-track="topology_interact"');
    expect(btn).toContain('data-track-action="heal"');
  });

  test('the final step opens the YAGNI case, even without JS', () => {
    const at = card.search(/\bdata-story-case\b/);
    const a = tagWith(card, 'data-story-case');
    expect(a.startsWith('<a')).toBe(true);
    expect(a).toMatch(/href="[^"]*case=yagni/);
    expect(a).toContain('data-track-action="case"');
    expect(langAt(card, at, 'en')).toContain('YAGNI');
    expect(langAt(card, at, 'ru')).toContain('YAGNI');
  });

  test('free play sits behind an Explore toggle that starts closed', () => {
    const btn = tagWith(card, 'data-story-explore');
    expect(btn).toContain('aria-expanded="false"');
    expect(btn).toContain('data-track-action="explore"');
    const panel = btn.match(/aria-controls="([^"]+)"/)?.[1];
    expect(panel).toBeDefined();
    expect(card).toMatch(new RegExp(`id="${panel}"[^>]*\\bhidden\\b|\\bhidden\\b[^>]*id="${panel}"`));
  });

  test('phones get a Play button (tracked as play) over a still poster', () => {
    const btn = tagWith(card, 'data-story-play');
    expect(btn).toContain('data-track="topology_interact"');
    expect(btn).toContain('data-track-action="play"');
  });

  test('no ⌘+SCROLL hint on touch: only inside a fine-pointer-only element', () => {
    const outside = card.replace(/<(\w+)[^>]*class="[^"]*\biso-hint-fine\b[^"]*"[^>]*>[\s\S]*?<\/\1>/g, '');
    expect(outside).not.toContain('⌘');
    expect(readFileSync('src/scripts/iso-engine.ts', 'utf8')).not.toContain('⌘');
    if (card.includes('iso-hint-fine')) {
      expect(css).toMatch(/\.iso-hint-fine\{[^}]*display:\s?none/);
      expect(css).toMatch(/@media\s?\(hover:\s?hover\)\s?and\s?\(pointer:\s?fine\)\{[^@]*\.iso-hint-fine\{/);
    }
  });

  test('story actions are declared in EVENTS and documented in the README', () => {
    expect(EVENTS.topology_interact).toEqual(['action']);
    const readme = readFileSync('README.md', 'utf8');
    const row = readme.split('\n').find((l) => l.startsWith('| `topology_interact`')) ?? '';
    for (const a of ['step2', 'step3', 'heal', 'case', 'play', 'explore']) expect(row).toContain(a);
    expect(readFileSync('src/scripts/analytics.ts', 'utf8')).toMatch(/step2\|step3\|heal\|case\|play\|explore/);
  });
});

describe('the GR monogram bridges to production', () => {
  test('a bridge line links to the YAGNI case in EN and RU', () => {
    const nca = html.slice(html.indexOf('class="nca-section"'));
    const at = nca.search(/class="[^"]*\bnca-bridge\b/);
    expect(at).toBeGreaterThan(-1);
    const block = nca.slice(at, nca.indexOf('</p>', at));
    expect(langAt(block, 0, 'en').length).toBeGreaterThan(30);
    expect(langAt(block, 0, 'ru').length).toBeGreaterThan(30);
    const links = [...block.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    expect(links.length).toBe(2);
    for (const a of links) {
      expect(a).toMatch(/href="[^"]*case=yagni/);
      expect(a).toContain('data-track="nca_interact"');
      expect(a).toContain('data-track-action="case"');
    }
    expect(readFileSync('src/scripts/analytics.ts', 'utf8')).toMatch(/nca_interact[\s\S]{0,300}\|\s?case/);
  });
});

// The story runs in a real browser: captions switch, Explore reveals free play,
// a phone gets a short poster with Play and no deck rail.
// Headless Chrome will not make a window narrower than 500px, so the page runs in an
// iframe of the wanted size and the outer page copies the probe result out for --dump-dom.
describe.skipIf(!existsSync(CHROME))('layout', () => {
  const PROBE = `<script>(async()=>{
    const q = new URLSearchParams(location.search);
    document.documentElement.setAttribute('data-lang', q.get('lang') || 'en');
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 300));
    const card = document.querySelector('.stage-iso-card');
    const shown = (sel) => { const el = card.querySelector(sel); if (!el) return null;
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const snap = () => ({ s1: shown('[data-story-step="1"]'), s2: shown('[data-story-step="2"]'), s3: shown('[data-story-step="3"]'),
      rail: shown('.iso-stratum-rail'), tabs: shown('.arch-tabs-bar'), play: shown('[data-story-play]'),
      next: shown('[data-story-next]'), cmd: [...card.querySelectorAll('*')].some((e) => e.children.length === 0 &&
        e.textContent.includes('⌘') && e.getBoundingClientRect().height > 0),
      h: Math.round(card.getBoundingClientRect().height) });
    const out = { initial: snap() };
    card.querySelector('[data-story-play]')?.click(); await frame();
    card.querySelector('[data-story-next]')?.click(); await frame();
    out.afterNext = snap();
    card.querySelector('[data-story-explore]')?.click(); await frame();
    out.afterExplore = snap();
    out.sw = document.documentElement.scrollWidth; out.vw = innerWidth;
    const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(out);
    document.body.appendChild(pre);
  })();</script>`;
  const FRAME = (lang: string, w: number) => `<!doctype html><body style="margin:0">
    <iframe src="/?lang=${lang}" width="${w}" height="900" style="border:0;display:block"></iframe>
    <script>const t=setInterval(()=>{const p=document.querySelector('iframe').contentDocument?.getElementById('__probe');
      if(p){clearInterval(t);const o=document.createElement('pre');o.id='__result';o.textContent=p.textContent;document.body.appendChild(o);}},100);</script>`;
  let server: ReturnType<typeof Bun.serve>;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;
        if (path === '/frame') {
          return new Response(FRAME(url.searchParams.get('lang') ?? 'en', Number(url.searchParams.get('w') ?? 375)), {
            headers: { 'content-type': 'text/html' },
          });
        }
        if (path === '/') return new Response(html.replace('</body>', `${PROBE}</body>`), { headers: { 'content-type': 'text/html' } });
        const file = Bun.file(join('dist', path));
        return (await file.exists()) ? new Response(file) : new Response('', { status: 404 });
      },
    });
  });
  afterAll(() => server?.stop(true));

  async function probe(lang: 'en' | 'ru', w: number) {
    const proc = Bun.spawn(
      [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--window-size=${Math.max(w + 40, 500)},1000`,
        '--virtual-time-budget=8000', '--dump-dom', `http://localhost:${server.port}/frame?lang=${lang}&w=${w}`],
      { stdout: 'pipe', stderr: 'ignore' },
    );
    const dom = await new Response(proc.stdout).text();
    await proc.exited;
    const json = dom.match(/<pre id="__result">([\s\S]*?)<\/pre>/)?.[1];
    expect(json).toBeDefined();
    return JSON.parse(json!.replace(/&quot;/g, '"'));
  }

  for (const lang of ['en', 'ru'] as const) {
    test(`${lang} at 1440: step 1 first, Next goes to step 2, Explore reveals free play`, async () => {
      const r = await probe(lang, 1440);
      expect(r.initial).toMatchObject({ s1: true, s2: false, s3: false, rail: false, tabs: false, play: false, next: true });
      expect(r.afterNext).toMatchObject({ s1: false, s2: true });
      expect(r.afterExplore).toMatchObject({ rail: true, tabs: true });
    });

    test(`${lang} at 375: a short poster with Play, no deck rail, no ⌘ hint, no horizontal scroll`, async () => {
      const r = await probe(lang, 375);
      expect(r.vw).toBe(375);
      expect(r.initial).toMatchObject({ play: true, rail: false, tabs: false, cmd: false });
      expect(r.initial.h).toBeLessThanOrEqual(420);
      expect(r.afterNext).toMatchObject({ s2: true, rail: false });
      expect(r.sw).toBeLessThanOrEqual(375);
    });
  }
});
