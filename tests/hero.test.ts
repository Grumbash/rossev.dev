// A recruiter on a phone decides in ~5 seconds: what does he solve, is there proof,
// how do I book him. The hero card must say that before the fold, in EN and RU.
// Checks the built output; the layout part drives headless Chrome when it is installed.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASE_STUDIES, PROFILE } from '../src/data/profile';
import { t } from '../src/i18n';
import { withChrome } from './fixtures/cdp';
import { buildSite } from './fixtures/build';
import { CHROME, hasChrome } from './fixtures/probe';

setDefaultTimeout(120_000);

const CV_NAME = 'Gleb_Rosev_Founding_Engineer_CV.pdf';

let html = '';
let card = '';
// EN at /, RU at /ru/: one hero card per locale.
const cards = { en: '', ru: '' };
const heroCard = (page: string) => {
  const start = page.indexOf('class="brutal-box hero-card"');
  return page.slice(start, page.indexOf('stage-iso-card', start));
};

beforeAll(() => {
  buildSite();
  html = readFileSync('dist/index.html', 'utf8');
  card = cards.en = heroCard(html);
  cards.ru = heroCard(readFileSync('dist/ru/index.html', 'utf8'));
});

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Own text of the first element carrying `cls` in that locale's hero card, links inside it left out.
function langText(cls: string, lang: 'en' | 'ru'): string {
  const m = cards[lang].match(new RegExp(`<(\\w+)\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? text(m[2].replace(/<a\b[\s\S]*?<\/a>/g, '')) : '';
}
const pos = (needle: string | RegExp) => card.search(needle);

describe('hero says what, proves it, then asks', () => {
  test('a value line sits right under the name, in both languages', () => {
    expect(pos(/class="[^"]*\bhero-value\b/)).toBeGreaterThan(pos('hero-title'));
    expect(langText('hero-value', 'en').length).toBeGreaterThan(30);
    expect(langText('hero-value', 'ru').length).toBeGreaterThan(30);
  });

  test('every number in the value line is a fact already on the page', () => {
    const facts = JSON.stringify([PROFILE.heroStats, CASE_STUDIES.map((c) => c.metrics)]);
    for (const lang of ['en', 'ru'] as const) {
      const nums = langText('hero-value', lang).match(/\d+/g) ?? [];
      expect(nums.length).toBeGreaterThan(0);
      for (const n of nums) expect(facts).toMatch(new RegExp(`(^|\\D)${n}(\\D|$)`));
    }
  });

  test('order in the card: value → stats → primary CTA → bio → contacts', () => {
    const order = [
      pos(/class="[^"]*\bhero-value\b/),
      pos('hero-stats-grid'),
      pos('data-track="cta_book"'),
      pos(/class="[^"]*\bhero-bio\b/),
      pos('contact-list'),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('the bio is short: at most 40 words in EN', () => {
    const words = langText('hero-bio', 'en').split(' ').filter(Boolean);
    expect(words.length).toBeGreaterThan(10);
    expect(words.length).toBeLessThanOrEqual(40);
    expect(langText('hero-bio', 'ru').length).toBeGreaterThan(30);
  });

  test('the third-person sentence is still in the card', () => {
    expect(text(card)).toContain('Gleb Rosev (also spelled Rossev) is a Founding Engineer at YAGNI');
  });
});

describe('the call to action says what the call is for', () => {
  test('primary CTA reads "30-min intro call" and keeps its tracking and UTM', () => {
    const a = card.match(/<a\b[^>]*data-track="cta_book"[^>]*>([\s\S]*?)<\/a>/);
    expect(a).not.toBeNull();
    expect(a![0]).toContain('utm_content=hero');
    expect(a![0]).toContain('data-track-placement="hero"');
    expect(text(a![1])).toMatch(/30-MIN INTRO CALL/i);
    expect(text(a![1])).toMatch(/30/);
  });

  test('a micro-line under the CTAs says who it is for and when I reply', () => {
    expect(pos(/class="[^"]*\bhero-cta-note\b/)).toBeGreaterThan(pos('data-track="cta_book"'));
    expect(langText('hero-cta-note', 'en')).toMatch(/24\s?h/);
    expect(langText('hero-cta-note', 'ru')).toMatch(/24/);
  });

  test('the CV downloads under the title the page uses', () => {
    const names = [...html.matchAll(/download="([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(2);
    for (const n of names) expect(n).toBe(CV_NAME);
  });
});

describe('contacts are compact', () => {
  test('email (with copy), LinkedIn and GitHub stay as rows; languages and place go to one meta line', () => {
    const list = card.slice(pos('contact-list'));
    expect((list.match(/class="contact-row"/g) ?? []).length).toBe(3);
    expect(list).toContain('data-track="email_copy"');
    expect(list).toContain(PROFILE.linkedin);
    expect(list).toContain(PROFILE.github);
    const meta = list.slice(list.search(/class="[^"]*\bcontact-meta\b/));
    expect(meta.length).toBeLessThan(list.length);
    expect(meta).toContain(PROFILE.timezone);
    expect(meta).toContain('C1');
  });
});

// Above the fold on a 375×812 phone: stats and the primary CTA, in EN and RU.
// Headless Chrome will not make a window narrower than 500px, so the page runs in a
// 375×812 iframe and the outer page copies the probe result out for --dump-dom.
describe.skipIf(!hasChrome())('layout at 375×812', () => {
  const PROBE = `<script>(async()=>{
    await document.fonts.ready;
    // Headless virtual time stops producing frames once the page is idle, so a frame may never
    // come; getBoundingClientRect lays the page out itself, the frame only lets it settle.
    await Promise.race([
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      new Promise((r) => setTimeout(r, 500)),
    ]);
    const card = document.querySelector('.hero-card');
    const bottom = (el) => (el ? Math.round(el.getBoundingClientRect().bottom) : -1);
    const out = document.createElement('pre');
    out.id = '__probe';
    out.textContent = JSON.stringify({
      cta: bottom(card.querySelector('a[data-track="cta_book"]')),
      stats: bottom(card.querySelector('.hero-stats-grid')),
      vh: innerHeight,
      sw: document.documentElement.scrollWidth,
      vw: innerWidth,
    });
    document.body.appendChild(out);
  })();</script>`;
  const FRAME = (lang: string) => `<!doctype html><body style="margin:0">
    <iframe src="${lang === 'ru' ? '/ru/' : '/'}" width="375" height="812" style="border:0;display:block"></iframe>
    <script>const t=setInterval(()=>{const p=document.querySelector('iframe').contentDocument?.getElementById('__probe');
      if(p){clearInterval(t);const o=document.createElement('pre');o.id='__result';o.textContent=p.textContent;document.body.appendChild(o);}},100);</script>`;
  let server: ReturnType<typeof Bun.serve>;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;
        if (path === '/frame') return new Response(FRAME(url.searchParams.get('lang') ?? 'en'), { headers: { 'content-type': 'text/html' } });
        if (path === '/' || path === '/ru/') {
          const page = path === '/' ? html : readFileSync('dist/ru/index.html', 'utf8');
          return new Response(page.replace('</body>', `${PROBE}</body>`), { headers: { 'content-type': 'text/html' } });
        }
        const file = Bun.file(join('dist', path));
        return (await file.exists()) ? new Response(file) : new Response('', { status: 404 });
      },
    });
  });
  afterAll(() => server?.stop(true));

  async function probe(lang: 'en' | 'ru') {
    const proc = Bun.spawn(
      [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--window-size=500,900',
        '--virtual-time-budget=8000', '--dump-dom', `http://localhost:${server.port}/frame?lang=${lang}`],
      { stdout: 'pipe', stderr: 'ignore' },
    );
    const dom = await new Response(proc.stdout).text();
    await proc.exited;
    const json = dom.match(/<pre id="__result">([\s\S]*?)<\/pre>/)?.[1];
    expect(json).toBeDefined();
    return JSON.parse(json!.replace(/&quot;/g, '"'));
  }

  for (const lang of ['en', 'ru'] as const) {
    test(`${lang}: stats and primary CTA end above y=812, no horizontal scroll`, async () => {
      const r = await probe(lang);
      expect(r.vw).toBe(375);
      expect(r.stats).toBeGreaterThan(0);
      expect(r.cta).toBeGreaterThan(0);
      expect(r.stats).toBeLessThanOrEqual(812);
      expect(r.cta).toBeLessThanOrEqual(812);
      expect(r.sw).toBeLessThanOrEqual(375);
    });
  }
});

describe.skipIf(!hasChrome())('topology on a touchscreen', () => {
  for (const lang of ['en', 'ru'] as const) {
    test(`a tap without prior hover selects the node and fault feedback uses ${lang}`, async () => {
      const words = t(lang).topology;
      await withChrome(async ({ send, evaluate, origin }) => {
        await send('Page.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
        await send('Emulation.setTouchEmulationEnabled', { enabled: true });
        await send('Page.navigate', { url: origin + (lang === 'en' ? '/' : '/ru/') });
        await Bun.sleep(500);
        await evaluate(`document.querySelector('[data-story-play]').click(); document.querySelector('.scenario-controls').open = true; document.querySelector('[data-story-explore]').click(); document.querySelector('#iso-arch-canvas').scrollIntoView({block:'center', behavior:'instant'})`);
        await Bun.sleep(600);
        expect(await evaluate("document.querySelector('#iso-arch-canvas').getAttribute('aria-label')")).toBe(words.canvasLabel);
        expect(await evaluate("document.querySelector('.iso-hint-fine').textContent")).toBe(words.controlsHint);
        const point = await evaluate(`(() => {
          const c = document.querySelector('#iso-arch-canvas'), r = c.getBoundingClientRect();
          for (let y = Math.max(1, r.top + 5); y < Math.min(innerHeight, r.bottom) - 4; y += 6) {
            for (let x = r.left + 6; x < r.right - 5; x += 6) {
              c.dispatchEvent(new PointerEvent('pointermove', {clientX:x, clientY:y, pointerType:'mouse'}));
              if (c.style.cursor === 'pointer') {
                const node = document.querySelector('#iso-hud-badge').textContent;
                c.dispatchEvent(new PointerEvent('pointerleave'));
                return { x, y, node };
              }
            }
          }
        })()`);
        expect(point).toBeDefined();
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        expect(await evaluate("document.querySelector('#iso-trace-status').textContent")).toBe(words.status.expanded.replace('{node}', point.node));
        await evaluate("document.querySelector('#btn-iso-fault').click()");
        await Bun.sleep(120);
        expect(await evaluate("document.querySelector('#iso-trace-status').textContent")).toStartWith(words.status.stage1.split('{node}')[0]);
      });
    });
  }
});
