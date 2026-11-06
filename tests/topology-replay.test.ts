// The hero topology plays a film of a real agent run on this site (PR #11, data in src/data/replay-pr11.json):
// the camera flies to each node as plan → code → tests → the judge's catch → fix → merge happen, and the
// G→R mis-heal plays from frames recorded on the real pre-fix weights. A visitor can take over at any moment:
// the film pauses where it is and the scene becomes an honest simulation (the judge catches what it would
// catch; with the judge off, the bug ships). Left alone, it offers to resume, then resumes.
// Replaces the 3-step story (tests/topology-story.test.ts). Unit part: film timing and the simulation rules;
// markup part: the built pages; layout part: headless Chrome when it is installed.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTS } from '../src/scripts/analytics';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { film, shotAt } from '../src/scripts/replay/director';
import {
  AUTO_RESUME_MS,
  RESUME_PROMPT_MS,
  START,
  analyticsFor,
  cutResult,
  injectFault,
  resume,
  showResumePrompt,
  takeover,
  tick,
  toggleJudge,
} from '../src/scripts/replay/sim';
import { buildSite } from './fixtures/build';
import { CHROME, hasChrome } from './fixtures/probe';

setDefaultTimeout(180_000);

const replay = JSON.parse(readFileSync('src/data/replay-pr11.json', 'utf8'));
const N = replay.events.length;

describe('film timing (director)', () => {
  let f: any;
  beforeAll(() => {
    f = film(replay);
  });

  test('one shot per event, in order, back to back, ending with a hold on the merge', () => {
    expect(f.shots.length).toBe(N);
    f.shots.forEach((s: any, i: number) => {
      expect(s.index).toBe(i);
      expect(s.node).toBe(replay.events[i].node);
      expect(s.end).toBeGreaterThan(s.start);
      if (i) expect(s.start).toBe(f.shots[i - 1].end);
    });
    expect(f.shots[0].start).toBe(0);
    expect(f.length).toBeGreaterThanOrEqual(f.shots.at(-1).end);
    // long enough to read a caption, short enough to see the whole story: 20–40 s
    expect(f.length).toBeGreaterThanOrEqual(20_000);
    expect(f.length).toBeLessThanOrEqual(40_000);
  });

  test('the catch gets the longest shot: it is the point of the film', () => {
    const catchShot = f.shots.find((s: any) => replay.events[s.index].kind === 'catch');
    for (const s of f.shots) expect(catchShot.end - catchShot.start).toBeGreaterThanOrEqual(s.end - s.start);
  });

  test('shotAt maps film time to the shot and its progress, and loops', () => {
    expect(shotAt(f, 0)).toEqual({ index: 0, progress: 0 });
    const last = f.shots.at(-1);
    expect(shotAt(f, last.start).index).toBe(N - 1);
    expect(shotAt(f, f.length - 1).index).toBe(N - 1);
    expect(shotAt(f, f.length).index).toBe(0);
    const mid = shotAt(f, (f.shots[1].start + f.shots[1].end) / 2);
    expect(mid.index).toBe(1);
    expect(mid.progress).toBeCloseTo(0.5, 5);
  });
});

describe('simulation rules', () => {
  let L = 0;
  beforeAll(() => {
    L = film(replay).length;
  });

  test('starts as the replay, judge on, nothing broken', () => {
    expect(START).toMatchObject({ mode: 'replay', t: 0, judge: true, outcome: null, idleMs: 0 });
  });

  test('watching: the film advances and loops', () => {
    expect(tick(START, 1000, L).t).toBe(1000);
    expect(tick({ ...START, t: L - 10 }, 20, L).t).toBe(10);
  });

  test('any interaction pauses the film exactly where it is and hands over', () => {
    const s = takeover({ ...START, t: 7345 });
    expect(s).toMatchObject({ mode: 'live', t: 7345, idleMs: 0 });
    expect(tick(s, 1000, L).t).toBe(7345);
    expect(toggleJudge({ ...START, t: 42 })).toMatchObject({ mode: 'live', t: 42, judge: false });
  });

  test('a fault the tests miss: the judge catches it when on, it ships when off', () => {
    expect(injectFault(START, 'logic')).toMatchObject({ mode: 'live', outcome: 'caught', caughtBy: 'judge' });
    expect(injectFault(toggleJudge(START), 'logic')).toMatchObject({ mode: 'live', outcome: 'shipped', caughtBy: null });
  });

  test('a fault that breaks a test: the sandbox catches it, judge or not', () => {
    expect(injectFault(START, 'test')).toMatchObject({ outcome: 'caught', caughtBy: 'sandbox' });
    expect(injectFault(toggleJudge(START), 'test')).toMatchObject({ outcome: 'caught', caughtBy: 'sandbox' });
  });

  test('a cut on the GR is judged by the real model’s result, whatever it is', () => {
    const live = takeover(START);
    expect(cutResult(live, 0.004)).toMatchObject({ outcome: 'healed' });
    expect(cutResult(live, 0.05)).toMatchObject({ outcome: 'unhealed' });
  });

  test('left alone: offers to resume after RESUME_PROMPT_MS, resumes by itself after AUTO_RESUME_MS', () => {
    expect(RESUME_PROMPT_MS).toBeGreaterThanOrEqual(4000);
    expect(AUTO_RESUME_MS).toBeGreaterThan(RESUME_PROMPT_MS);
    let s = injectFault(takeover({ ...START, t: 5000 }), 'logic');
    s = tick(s, RESUME_PROMPT_MS - 1, L);
    expect(showResumePrompt(s)).toBe(false);
    s = tick(s, 1, L);
    expect(showResumePrompt(s)).toBe(true);
    s = tick(s, AUTO_RESUME_MS - RESUME_PROMPT_MS, L);
    expect(s).toMatchObject({ mode: 'replay', t: 5000, outcome: null, judge: true });
  });

  test('another interaction restarts the idle clock', () => {
    let s = tick(takeover(START), RESUME_PROMPT_MS + 10, L);
    expect(showResumePrompt(s)).toBe(true);
    s = toggleJudge(s);
    expect(s.idleMs).toBe(0);
    expect(showResumePrompt(s)).toBe(false);
  });

  test('resume goes back to the film at the point of divergence, with the judge back on', () => {
    expect(resume(injectFault(toggleJudge({ ...START, t: 9000 }), 'logic'))).toMatchObject({
      mode: 'replay', t: 9000, judge: true, outcome: null,
    });
  });

  test('analytics: takeover once on the way in, resume on the way out, each outcome', () => {
    const live = takeover(START);
    expect(analyticsFor(START, live)).toEqual({ action: 'takeover' });
    expect(analyticsFor(live, toggleJudge(live))).toBeNull();
    const shipped = injectFault(toggleJudge(live), 'logic');
    expect(analyticsFor(toggleJudge(live), shipped)).toEqual({ action: 'outcome', outcome: 'shipped' });
    expect(analyticsFor(shipped, resume(shipped))).toEqual({ action: 'resume' });
  });
});

let css = '';
const pages = { en: '', ru: '' };
const cards = { en: '', ru: '' };
const topologyCard = (page: string) => {
  const start = page.indexOf('stage-iso-card');
  return page.slice(start, page.indexOf('id="experience"', start));
};
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function textOf(src: string, attr: string): string {
  const m = src.match(new RegExp(`<(\\w+)\\b[^>]*\\b${attr}\\b[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? text(m[2]) : '';
}
const tagWith = (src: string, attr: string) => src.match(new RegExp(`<(\\w+)\\b[^>]*\\b${attr}\\b[^>]*>`))?.[0] ?? '';

beforeAll(() => {
  buildSite();
  pages.en = readFileSync('dist/index.html', 'utf8');
  pages.ru = readFileSync('dist/ru/index.html', 'utf8');
  cards.en = topologyCard(pages.en);
  cards.ru = topologyCard(pages.ru);
  const dir = 'dist/_astro';
  css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  css += [...pages.en.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
});

describe('the card is a replay you can take over', () => {
  test('the old 3-step story is gone', () => {
    for (const c of [cards.en, cards.ru]) {
      expect(c).not.toMatch(/data-story-(step|next|prev|break)\b/);
    }
  });

  test('a mode badge starts on REPLAY · PR #11, from the dictionaries', () => {
    expect(en.topology.replayBadge).toContain('PR #11');
    expect(ru.topology.replayBadge).toContain('PR #11');
    expect(en.topology.yourRun.length).toBeGreaterThan(3);
    expect(ru.topology.yourRun).toMatch(/[А-Яа-яЁё]/);
    expect(textOf(cards.en, 'data-replay-badge')).toBe(en.topology.replayBadge);
    expect(textOf(cards.ru, 'data-replay-badge')).toBe(ru.topology.replayBadge);
  });

  test('an honest label links to the real PR', () => {
    for (const [lang, c] of [['en', cards.en], ['ru', cards.ru]] as const) {
      const a = tagWith(c, 'data-replay-label');
      expect(a.startsWith('<a')).toBe(true);
      expect(a).toContain(`href="${replay.url}"`);
      expect(a).toMatch(/rel="[^"]*noopener/);
      expect(textOf(c, 'data-replay-label')).toBe(replay.label[lang]);
    }
  });

  test('a timeline slider, keyboard-operable, one stop per event', () => {
    for (const c of [cards.en, cards.ru]) {
      const s = tagWith(c, 'data-replay-timeline');
      expect(s).toContain('role="slider"');
      expect(s).toContain('tabindex="0"');
      expect(s).toContain('aria-valuemin="0"');
      expect(s).toContain(`aria-valuemax="${N - 1}"`);
      expect(s).toMatch(/aria-label="[^"]{4,}"/);
    }
  });

  test('take-over controls: inject a fault, judge switch (on), resume (hidden until offered)', () => {
    for (const c of [cards.en, cards.ru]) {
      expect(tagWith(c, 'data-sim-fault').startsWith('<button')).toBe(true);
      const judge = tagWith(c, 'data-sim-judge');
      expect(judge.startsWith('<button')).toBe(true);
      expect(judge).toContain('aria-pressed="true"');
      expect(tagWith(c, 'data-replay-resume')).toMatch(/\bhidden\b/);
    }
  });

  test('the film can be paused (WCAG 2.2.2): a pause toggle, not pressed', () => {
    for (const c of [cards.en, cards.ru]) {
      const b = tagWith(c, 'data-replay-pause');
      expect(b.startsWith('<button')).toBe(true);
      expect(b).toContain('aria-pressed="false"');
    }
  });

  test('the take-over says it is a simulation; the shipped line does not deny the human gate', () => {
    for (const d of [en, ru]) {
      expect(d.topology.yourRun.length).toBeGreaterThan(3);
      expect(d.topology.simulated.length).toBeGreaterThan(3);
    }
    expect(en.topology.simulated).toMatch(/simulat/i);
    expect(JSON.stringify(en.topology)).not.toMatch(/nobody else looked/i);
  });

  test('captions are announced through a polite live region', () => {
    for (const c of [cards.en, cards.ru]) expect(tagWith(c, 'data-replay-live')).toContain('aria-live="polite"');
  });

  test('the topology engine is not in the eager JS: real headroom under the 40 KB budget', () => {
    const eager = [...pages.en.matchAll(/<script\b[^>]*\bsrc="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
    const preload = [...pages.en.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
    const files = [...new Set([...eager, ...preload])].map((f) => readFileSync(join('dist', f)));
    const gz = files.reduce((n, b) => n + Bun.gzipSync(b, { level: 9 }).length, 0);
    expect(gz).toBeLessThanOrEqual(8000);
    for (const b of files) expect(b.toString()).not.toContain('INCIDENT RESOLVED');
  });

  test('the replay costs nothing up front: its data and frames are not inlined in the page', () => {
    for (const p of [pages.en, pages.ru]) {
      expect(p).not.toContain(replay.events.find((e: any) => e.kind === 'catch').caption.en);
      expect(p).not.toContain('"frames"');
    }
    expect(existsSync('dist/replay/pr11-gr.json')).toBe(true);
  });

  test('kept from the story: YAGNI case link, Explore (closed), phone Play, ⌘ only on fine pointers', () => {
    const a = tagWith(cards.en, 'data-story-case');
    expect(a.startsWith('<a')).toBe(true);
    expect(a).toMatch(/href="[^"]*case=yagni/);
    expect(a).toContain('data-track-action="case"');
    expect(tagWith(cards.ru, 'data-story-case')).toMatch(/href="\/ru\/[^"]*case=yagni/);
    const explore = tagWith(cards.en, 'data-story-explore');
    expect(explore).toContain('aria-expanded="false"');
    const panel = explore.match(/aria-controls="([^"]+)"/)?.[1];
    expect(cards.en).toMatch(new RegExp(`id="${panel}"[^>]*\\bhidden\\b|\\bhidden\\b[^>]*id="${panel}"`));
    expect(tagWith(cards.en, 'data-story-play')).toContain('data-track-action="play"');
    const outside = cards.en.replace(/<(\w+)[^>]*class="[^"]*\biso-hint-fine\b[^"]*"[^>]*>[\s\S]*?<\/\1>/g, '');
    expect(outside).not.toContain('⌘');
    if (cards.en.includes('iso-hint-fine')) expect(css).toMatch(/\.iso-hint-fine\{[^}]*display:\s?none/);
  });

  test('the GR monogram bridge line still links to the YAGNI case', () => {
    for (const p of [pages.en, pages.ru]) {
      const nca = p.slice(p.indexOf('class="nca-section"'));
      const at = nca.search(/class="[^"]*\bnca-bridge\b/);
      expect(at).toBeGreaterThan(-1);
      expect(nca.slice(at, nca.indexOf('</p>', at))).toMatch(/href="[^"]*case=yagni/);
    }
  });

  test('analytics: topology_interact carries action + outcome; new actions documented', () => {
    expect(EVENTS.topology_interact).toEqual(['action', 'outcome']);
    const src = readFileSync('src/scripts/analytics.ts', 'utf8');
    expect(src).toMatch(/replay\|takeover\|resume\|scrub/);
    expect(src).toMatch(/caught\|shipped\|healed\|unhealed/);
    const row = readFileSync('README.md', 'utf8').split('\n').find((l) => l.startsWith('| `topology_interact`')) ?? '';
    for (const w of ['takeover', 'resume', 'scrub', 'outcome', 'shipped']) expect(row).toContain(w);
  });
});

// In a real browser. Headless Chrome will not make a window narrower than 500px, so the page runs in an
// iframe of the wanted size and the outer page copies the probe result out for --dump-dom.
// rAF stalls inside an iframe under --virtual-time-budget: frames run on a 16 ms timer, counted.
describe.skipIf(!hasChrome())('layout and behaviour', () => {
  const RAF = `<script>window.__raf=0;window.requestAnimationFrame=(cb)=>{window.__raf++;return setTimeout(()=>cb(performance.now()),16)};
    window.cancelAnimationFrame=(id)=>clearTimeout(id);</script>`;
  const PROBE = `<script>(async()=>{
    const q = new URLSearchParams(location.search);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await document.fonts.ready;
    await wait(300);
    const card = document.querySelector('.stage-iso-card');
    const $ = (sel) => card.querySelector(sel);
    const shown = (sel) => { const el = $(sel); if (!el) return null;
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.hidden; };
    const snap = () => ({ badge: $('[data-replay-badge]')?.textContent.trim(), shot: card.getAttribute('data-replay-shot'),
      outcome: card.getAttribute('data-outcome'), first: card.getAttribute('data-first-outcome'), stamp: card.getAttribute('data-replay-stamp'),
      live: $('[data-replay-live]')?.textContent.trim(), resume: shown('[data-replay-resume]'), play: shown('[data-story-play]'),
      rail: shown('.iso-stratum-rail'), dossier: shown('#iso-inspector-card'), slider: shown('[data-replay-timeline]'),
      judge: $('[data-sim-judge]')?.getAttribute('aria-pressed'), h: Math.round(card.getBoundingClientRect().height) });
    const key = (el, k) => { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
    const fetched = () => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /replay|pr11/.test(n));
    const out = {};
    const mode = q.get('mode');
    if (mode === 'watch') {
      out.a = snap(); await wait(5000); out.b = snap(); out.fetched = fetched();
      await wait(4000); out.c = snap();
      const s = $('[data-replay-timeline]');
      key(s, 'Home'); await wait(200); out.home = snap();
      const catchAt = ${JSON.stringify(replay.events.findIndex((e: any) => e.kind === 'catch'))};
      for (let i = 0; i < catchAt; i++) { key(s, 'ArrowRight'); await wait(60); }
      await wait(2500); out.atCatch = snap(); out.sliderNow = s.getAttribute('aria-valuenow');
      key(s, 'End'); await wait(300); out.end = snap();
      key(s, 'Home'); await wait(3000); out.afterScrub = snap();
      out.pausePressed = $('[data-replay-pause]')?.getAttribute('aria-pressed');
    } else if (mode === 'takeover') {
      $('.scenario-controls summary').click();
      out.a = snap();
      $('[data-sim-judge]').click(); await wait(200); out.judgeOff = snap();
      // The fault button opens a menu; the bad deploy (the PR #11 kind of bug) is one pick in it.
      const bad = async () => { $('[data-sim-fault]').click(); await wait(300); $('[data-sim-fault-kind="bad_deploy"]').click(); };
      await bad(); await wait(6000); out.shipped = snap();
      $('[data-sim-judge]').click(); await wait(100); await bad(); await wait(6000); out.caught = snap();
      await wait(${RESUME_PROMPT_MS} + 300); out.offer = snap();
      await wait(${AUTO_RESUME_MS - RESUME_PROMPT_MS} + 300); out.back = snap();
    } else if (mode === 'explore') {
      $('.scenario-controls summary').click();
      $('[data-sim-judge]').click(); await wait(200); out.a = snap();
      $('[data-story-explore]').click(); await wait(${AUTO_RESUME_MS} + 1500); out.exploring = snap();
    } else if (mode === 'rm') {
      const r0 = window.__raf; await wait(2500); out.rafIdle = window.__raf - r0; out.a = snap();
    } else {
      out.rafBeforePlay = window.__raf; out.a = snap();
      $('[data-story-play]')?.click(); await wait(800);
      out.rafAfterPlay = window.__raf - out.rafBeforePlay; out.b = snap();
    }
    out.sw = document.documentElement.scrollWidth; out.vw = innerWidth;
    const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(out);
    document.body.appendChild(pre);
  })();</script>`;
  const FRAME = (lang: string, w: number, mode: string) => `<!doctype html><body style="margin:0">
    <iframe src="${lang === 'ru' ? '/ru/' : '/'}?mode=${mode}" width="${w}" height="2400" style="border:0;display:block"></iframe>
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
          const p = url.searchParams;
          return new Response(FRAME(p.get('lang') ?? 'en', Number(p.get('w') ?? 1440), p.get('mode') ?? 'watch'), { headers: { 'content-type': 'text/html' } });
        }
        if (path === '/' || path === '/ru/') {
          const page = path === '/' ? pages.en : pages.ru;
          return new Response(page.replace('<head>', `<head>${RAF}`).replace('</body>', `${PROBE}</body>`), { headers: { 'content-type': 'text/html' } });
        }
        const file = Bun.file(join('dist', path));
        return (await file.exists()) ? new Response(file) : new Response('', { status: 404 });
      },
    });
  });
  afterAll(() => server?.stop(true));

  async function probe(lang: 'en' | 'ru', w: number, mode: string, budget = 20000) {
    const proc = Bun.spawn(
      [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--window-size=${Math.max(w + 40, 500)},2600`,
        ...(mode === 'rm' ? ['--force-prefers-reduced-motion'] : []),
        `--virtual-time-budget=${budget}`, '--dump-dom', `http://localhost:${server.port}/frame?lang=${lang}&w=${w}&mode=${mode}`],
      { stdout: 'pipe', stderr: 'ignore' },
    );
    const dom = await new Response(proc.stdout).text();
    await proc.exited;
    const json = dom.match(/<pre id="__result">([\s\S]*?)<\/pre>/)?.[1];
    expect(json).toBeDefined();
    return JSON.parse(json!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  }

  const dict = { en, ru };
  for (const lang of ['en', 'ru'] as const) {
    test(`${lang} at 1440: it plays by itself, lazily loads its data, scrubs to the catch and the merge`, async () => {
      const r = await probe(lang, 1440, 'watch');
      expect(r.a.badge).toBe(dict[lang].topology.replayBadge);
      expect(r.a.dossier).toBe(false);
      expect(Number(r.b.shot)).toBeGreaterThan(Number(r.a.shot ?? -1));
      expect(r.fetched.some((n: string) => n.includes('pr11-gr.json'))).toBe(true);
      expect(r.home.shot).toBe('0');
      const c = replay.events.find((e: any) => e.kind === 'catch');
      expect(r.atCatch.live).toBe(c.caption[lang]);
      expect(r.atCatch.stamp).toBe('caught');
      expect(r.end.shot).toBe(String(N - 1));
      expect(r.end.live).toBe(replay.events[N - 1].caption[lang]);
      // autoplay does not re-announce every caption; only visitor-caused changes reach the live region
      expect(r.b.live).toBe(r.a.live);
      expect(r.c.live).toBe(r.a.live);
      expect(Number(r.c.shot)).toBeGreaterThan(Number(r.b.shot));
      // scrubbing pauses the film where the visitor put it
      expect(r.afterScrub.shot).toBe('0');
      expect(r.pausePressed).toBe('true');
      expect(r.sw).toBeLessThanOrEqual(1440);
    });

    test(`${lang} at 1440: take over, ship a bug with the judge off, get caught with it on, then resume`, async () => {
      const r = await probe(lang, 1440, 'takeover', 40000);
      expect(r.a.badge).toBe(dict[lang].topology.replayBadge);
      expect(r.judgeOff).toMatchObject({ badge: dict[lang].topology.yourRun, judge: 'false' });
      // with the judge off it ships first; the policy may roll it back afterwards
      expect(r.shipped.first).toBe('shipped');
      expect(['shipped', 'recovered']).toContain(r.shipped.outcome);
      expect(r.caught.outcome).toBe('caught');
      expect(r.caught.judge).toBe('true');
      expect(r.offer.resume).toBe(true);
      // offering Resume does not move anything (it appears outside the input window, so it would count as CLS)
      expect(r.offer.h).toBe(r.caught.h);
      expect(r.back.badge).toBe(dict[lang].topology.replayBadge);
      expect(r.back.outcome).toBeNull();
    });

    test(`${lang} at 1440: while Explore is open the idle clock stops: no Resume, no auto-resume`, async () => {
      const r = await probe(lang, 1440, 'explore', 20000);
      expect(r.a.badge).toBe(dict[lang].topology.yourRun);
      expect(r.exploring.resume).toBe(false);
      expect(r.exploring.badge).not.toBe(dict[lang].topology.replayBadge);
    });

    test(`${lang} reduced motion: a still final frame and the timeline, no running loop`, async () => {
      const r = await probe(lang, 1440, 'rm', 8000);
      expect(r.rafIdle).toBeLessThanOrEqual(3);
      expect(r.a.shot).toBe(String(N - 1));
      expect(r.a.slider).toBe(true);
    });

    test(`${lang} at 375: poster + Play, no loop before Play, plays after, no deck rail, short card`, async () => {
      const r = await probe(lang, 375, 'phone', 8000);
      expect(dict[lang].topology.replayBadge).toContain('PR #11');
      expect(r.vw).toBe(375);
      expect(r.a).toMatchObject({ play: true, rail: false });
      expect(r.rafBeforePlay).toBeLessThanOrEqual(3);
      expect(r.rafAfterPlay).toBeGreaterThan(0);
      expect(r.b.badge).toBe(dict[lang].topology.replayBadge);
      expect(r.a.h).toBeLessThanOrEqual(440);
      expect(r.sw).toBeLessThanOrEqual(375);
    });
  }
});
