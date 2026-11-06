// No page loads between pages. Every page opts into cross-document View Transitions, so a click to
// another page crossfades instead of blanking, the top bar stays still, and a post's title flies
// from its card on /writing/ (or from the inline brief on home) into the post page's heading.
// Hovering a link prefetches the page (Speculation Rules), so the next page is already here.
// Prefetch, not prerender: a prerendered page runs its scripts, and Umami would count a page view
// for a page nobody opened. Reduced motion gets the plain navigation.
import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BLOG_POSTS } from '../src/data/posts';
import { buildSite } from './fixtures/build';
import { CHROME, hasChrome } from './fixtures/probe';

beforeAll(() => buildSite());

const html = (path: string) => readFileSync(join('dist', path), 'utf8');
const pages = () => [...new Bun.Glob('**/index.html').scanSync('dist')].filter((f) => !f.includes('partials/'));
const css = () => readFileSync('src/styles/brutalism.css', 'utf8').replace(/\s+/g, ' ');
// The shared-element names on a page: --vt on .vt-title elements.
const names = (h: string, cls = 'vt-title') => [...h.matchAll(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*style="[^"]*--vt:\\s*([\\w-]+)`, 'g'))].map((m) => m[1]);

describe('the transition', () => {
  test('every page opts in, unless the visitor asked for less motion', () => {
    expect(css()).toMatch(/@media \(prefers-reduced-motion: ?no-preference\) ?\{ ?@view-transition ?\{ ?navigation: ?auto;? ?\} ?\}/);
  });

  test('the top bar is one named element, so it stays put while the page changes under it', () => {
    expect(css()).toMatch(/\.top-nav ?\{[^}]*view-transition-name: ?site-nav/);
  });

  test('a title carries its name in --vt, so the language morph can borrow view-transition-name and give it back', () => {
    expect(css()).toMatch(/\.vt-title ?\{ ?view-transition-name: ?var\(--vt\);? ?\}/);
  });
});

describe('the title that flies', () => {
  const name = (slug: string) => `post-${slug}`;

  test('on /writing/ every card title carries its post\'s name, in both languages, but takes it only when clicked', () => {
    expect(css()).not.toMatch(/\.vt-card ?\{/);
    expect(readFileSync('src/scripts/site.ts', 'utf8')).toMatch(/closest\('\.post-card'\)\?\.querySelector<HTMLElement>\('\.vt-card'\)/);
    for (const prefix of ['', 'ru/']) {
      expect(names(html(`${prefix}writing/index.html`))).toEqual([]);
      const n = names(html(`${prefix}writing/index.html`), 'vt-card');
      expect(n.sort()).toEqual(BLOG_POSTS.map((p) => name(p.slug)).sort());
    }
  });

  test('the post page heading has the same name, so the card title lands in it', () => {
    for (const p of BLOG_POSTS)
      for (const prefix of ['', 'ru/']) {
        const h = html(`${prefix}writing/${p.slug}/index.html`);
        expect(h.match(/<h1\b[^>]*>/)?.[0], `${prefix}${p.slug}`).toContain(`--vt: ${name(p.slug)}`);
      }
  });

  test('the inline brief on home names its heading too: "read the full post" lands the same way', () => {
    const p = BLOG_POSTS[0];
    const partial = html(`partials/post-${p.id}/index.html`);
    expect(names(partial)).toEqual([name(p.slug)]);
  });

  test('home cards are not named: the brief of the same post may sit next to them, and a name must be unique', () => {
    expect(names(html('index.html'))).toEqual([]);
  });

  test('no page names two elements alike (a duplicate makes the browser skip the transition)', () => {
    for (const f of pages()) {
      const n = names(html(f));
      expect(new Set(n).size, f).toBe(n.length);
    }
  });
});

describe('the next page is already here', () => {
  const rules = (h: string) => {
    const m = h.match(/<script type="speculationrules">([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]) : null;
  };

  test('every page carries the same speculation rules: prefetch site links on hover, never prerender', () => {
    const all = pages().map((f) => [f, rules(html(f))] as const);
    for (const [f, r] of all) {
      if (f === 'c/index.html' || f === 'ru/c/index.html') continue; // the QR card has its own small head
      expect(r, f).not.toBeNull();
      expect(r.prerender, f).toBeUndefined();
      expect(r.prefetch?.[0]?.eagerness, f).toBe('moderate');
    }
    expect(new Set(all.filter(([, r]) => r).map(([, r]) => JSON.stringify(r))).size).toBe(1);
  });

  test('only pages: no partials, files to download, new tabs or links that leave the site', () => {
    const where = JSON.stringify(rules(html('index.html')).prefetch[0].where);
    for (const s of ['/partials/*', '/ru/partials/*', '*.pdf', '*.vcf', '*.txt', '[download]', '[target=_blank]']) expect(where).toContain(s);
    expect(where).toContain('"href_matches":"/*"');
  });
});

// Real Chrome over the DevTools protocol: a real mouse hover, which --dump-dom cannot do. The hover
// must start a prefetch, the click must use it, and the post page must open with a view transition
// in which only the clicked card's title flies.
describe.skipIf(!hasChrome())('in the browser', () => {
  test('hover prefetches, the click uses it, and one title flies into the post heading', async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        let p = new URL(req.url).pathname;
        if (p.endsWith('/')) p += 'index.html';
        const f = Bun.file(join('dist', p));
        return (await f.exists()) ? new Response(f) : new Response('', { status: 404 });
      },
    });
    const profile = mkdtempSync(join(tmpdir(), 'vt-'));
    const chrome = Bun.spawn([CHROME, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1280,900', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' });
    try {
      // With port 0 Chrome picks a free port and writes it to DevToolsActivePort.
      let port = '';
      for (let i = 0; i < 100 && !port; i++) {
        await Bun.sleep(100);
        port = existsSync(join(profile, 'DevToolsActivePort')) ? readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] : '';
      }
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t: { type: string }) => t.type === 'page');
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => (ws.onopen = r));
      let id = 0;
      const pending = new Map<number, (v: any) => void>();
      const prefetch: string[] = [];
      ws.onmessage = (m) => {
        const d = JSON.parse(String(m.data));
        if (d.method === 'Preload.prefetchStatusUpdated') prefetch.push(`${new URL(d.params.key.url).pathname} ${d.params.prefetchStatus}`);
        if (d.id && pending.has(d.id)) pending.get(d.id)!(d.result ?? d.error), pending.delete(d.id);
      };
      const send = (method: string, params: object = {}) => new Promise<any>((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
      const evaluate = async (expression: string) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
      await send('Page.enable');
      await send('Preload.enable');
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `addEventListener('pagereveal', (e) => { window.__vt = !!e.viewTransition; e.viewTransition?.ready.then(() => (window.__groups = [...new Set(document.getAnimations().map((a) => a.effect?.pseudoElement).filter((p) => p?.startsWith('::view-transition-group')))])); });`,
      });
      await send('Page.navigate', { url: `http://localhost:${server.port}/writing/` });
      await Bun.sleep(1500);
      const at = await evaluate(`(() => { const a = document.querySelector('.post-card a[href="/writing/self-healing-monogram/"]'); a.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      await Bun.sleep(800);
      await evaluate(`document.querySelector('.post-card a[href="/writing/self-healing-monogram/"]').click()`);
      await Bun.sleep(1500);
      const r = await evaluate(`({ path: location.pathname, delivery: performance.getEntriesByType('navigation')[0].deliveryType, vt: window.__vt, groups: window.__groups })`);
      ws.close();
      expect(prefetch).toContain('/writing/self-healing-monogram/ PrefetchResponseUsed');
      expect(r).toMatchObject({ path: '/writing/self-healing-monogram/', delivery: 'navigational-prefetch', vt: true });
      expect(r.groups.sort()).toEqual(['::view-transition-group(post-self-healing-monogram)', '::view-transition-group(root)', '::view-transition-group(site-nav)']);
    } finally {
      chrome.kill();
      server.stop(true);
      rmSync(profile, { recursive: true, force: true });
    }
  }, 60_000);
});
