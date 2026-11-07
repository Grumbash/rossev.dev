// No network, and the site still works. A service worker (dist/sw.js, built by astro.config.mjs from
// src/sw/) keeps the shell (home, /writing/, the offline page, in both languages, and the scripts
// they load) from the first visit, and every page the visitor opens after. Pages go network first,
// so the newest text always wins online; hashed assets go cache first. Offline, a page never opened
// gets the offline page in its language, which lists the posts this browser can read without the
// network. Nothing from other origins, nothing under /booked/ (its query can carry a booking's
// personal data), and pages are stored without their query.
import { describe, expect, setDefaultTimeout, test, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cacheKey, offlinePath, route } from '../src/sw/policy';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { withChrome } from './fixtures/cdp';
import { hasChrome } from './fixtures/probe';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

const O = 'https://rossev.dev';
const at = (path: string) => new URL(path, O);

describe('what the worker does with a request', () => {
  test('hashed assets and fonts from cache first; pages, partials and files from the network first', () => {
    expect(route(at('/_astro/site.B1x.js'), O, 'GET', 'no-cors')).toBe('asset');
    expect(route(at('/_astro/syne-latin-wght-normal.BV.woff2'), O, 'GET', 'cors')).toBe('asset');
    expect(route(at('/writing/self-healing-monogram/'), O, 'GET', 'navigate')).toBe('page');
    expect(route(at('/partials/post-post-3/'), O, 'GET', 'cors')).toBe('page');
    expect(route(at('/llms.txt'), O, 'GET', 'cors')).toBe('page');
  });

  test('leaves alone: other origins, anything but GET, /booked/, Vercel scripts, the worker itself', () => {
    expect(route(new URL('https://cloud.umami.is/script.js'), O, 'GET', 'no-cors')).toBe('skip');
    expect(route(at('/writing/'), O, 'POST', 'navigate')).toBe('skip');
    expect(route(at('/booked/?name=Jane&email=j@x.io'), O, 'GET', 'navigate')).toBe('skip');
    expect(route(at('/ru/booked/'), O, 'GET', 'navigate')).toBe('skip');
    expect(route(at('/_vercel/insights/script.js'), O, 'GET', 'no-cors')).toBe('skip');
    expect(route(at('/sw.js'), O, 'GET', 'same-origin')).toBe('skip');
  });

  test('a page is stored without its query or fragment', () => {
    expect(cacheKey(at('/?case=yagni#experience'))).toBe(`${O}/`);
    expect(cacheKey(at('/writing/x/?probe=1'))).toBe(`${O}/writing/x/`);
  });

  test('the offline page is in the language of the page asked for', () => {
    expect(offlinePath(at('/writing/x/'))).toBe('/offline/');
    expect(offlinePath(at('/ru/writing/x/'))).toBe('/ru/offline/');
    expect(offlinePath(at('/ru'))).toBe('/ru/offline/');
    expect(offlinePath(at('/rubric/'))).toBe('/offline/');
  });
});

describe('the build', () => {
  const sw = () => readFileSync('dist/sw.js', 'utf8');
  const precache = () => JSON.parse(sw().match(/PRECACHE\s*=\s*(\[[^\]]*\])/)![1]) as string[];

  test('emits the worker with a version and the shell to keep from the first visit', () => {
    expect(sw()).toMatch(/VERSION\s*=\s*"[0-9a-f]{12}"/);
    for (const p of ['/', '/ru/', '/writing/', '/ru/writing/', '/offline/', '/ru/offline/']) expect(precache()).toContain(p);
    expect(precache().some((p) => p.includes('booked'))).toBe(false);
  });

  test('the shell includes every script and preloaded font home loads, so home works offline as it is', () => {
    const home = readFileSync('dist/index.html', 'utf8');
    const loaded = [...home.matchAll(/(?:src|href)="(\/_astro\/[^"]+\.(?:js|woff2))"/g)].map((m) => m[1]);
    expect(loaded.length).toBeGreaterThan(0);
    for (const a of loaded) expect(precache()).toContain(a);
  });

  test('the worker itself is never cached by the browser or the CDN, so a new build reaches visitors', () => {
    const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
    const h = v.headers.find((x: { source: string }) => x.source === '/sw.js');
    expect(h?.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' });
  });
});

describe('the offline page', () => {
  test('exists in both languages, says what it is, and stays out of search and the sitemap', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const h = readFileSync(`dist/${prefix}offline/index.html`, 'utf8');
      expect(h).toContain('<meta name="robots" content="noindex"');
      expect(h).toContain(d.offline.title);
      expect(h).toContain('data-offline-list');
    }
    expect(readFileSync('dist/sitemap-0.xml', 'utf8')).not.toContain('/offline/');
    expect(JSON.parse(readFileSync('dist/routes.json', 'utf8'))).not.toContain('/offline/');
  });

  test('the toast that says the network went away is in the page language', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const toast = readFileSync(`dist/${prefix}index.html`, 'utf8').match(/<div[^>]*id="brutal-toast"[^>]*>/)![0];
      expect(toast).toContain(`data-offline="${d.offline.toast}"`);
    }
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  for (const prefix of ['', '/ru']) {
    test(`first visit directly to ${prefix}/writing/ keeps the post and its script offline`, async () => {
      const post = prefix + '/writing/self-healing-monogram/';
      await withChrome(async ({ origin, send, evaluate, stopServer }) => {
        await send('Page.enable');
        await send('Page.navigate', { url: origin + post + '?from=first' });
        const deadline = Date.now() + 15_000;
        let state = null;
        do {
          await Bun.sleep(150);
          state = await evaluate(`({ path: location.pathname, ready: document.readyState, controlled: !!navigator.serviceWorker?.controller })`);
        } while (Date.now() < deadline && !(state?.path === post && state.ready === 'complete' && state.controlled));
        expect(state).toEqual({ path: post, ready: 'complete', controlled: true });
        const title = await evaluate('document.title');
        expect(await evaluate(`caches.match(location.href).then(Boolean)`)).toBe(false);
        expect(await evaluate(`caches.match(location.pathname).then(Boolean)`)).toBe(true);
        stopServer();
        await send('Network.setCacheDisabled', { cacheDisabled: true });
        await send('Page.navigate', { url: origin + post });
        await Bun.sleep(800);
        expect(await evaluate('document.title')).toBe(title);
        expect(await evaluate("!!document.querySelector('[data-quote-bar]')")).toBe(true);
      });
    });
  }

  test('read a post, lose the network: it still opens, home still opens, an unread post gets the offline page listing it', async () => {
    const r = await withChrome(async ({ origin, send, evaluate, stopServer }) => {
      await send('Page.enable');
      const go = async (path: string) => {
        await send('Page.navigate', { url: `${origin}${path}` });
        await Bun.sleep(1200);
        return evaluate(`({ title: document.title, lang: document.documentElement.lang, path: location.pathname, list: [...document.querySelectorAll('[data-offline-list] a')].map((a) => a.getAttribute('href')) })`);
      };
      await go('/');
      const ready = await evaluate(`navigator.serviceWorker.ready.then(() => new Promise((r) => (navigator.serviceWorker.controller ? r(true) : navigator.serviceWorker.addEventListener('controllerchange', () => r(true)))))`);
      const read = await go('/writing/self-healing-monogram/');
      await evaluate(`new Promise((r) => setTimeout(r, 500))`);
      stopServer();
      return {
        ready,
        read,
        again: await go('/writing/self-healing-monogram/'),
        home: await go('/'),
        unread: await go('/writing/no-threejs-topology/'),
        unreadRu: await go('/ru/writing/no-threejs-topology/'),
        toast: await evaluate(`(dispatchEvent(new Event('offline')), document.getElementById('brutal-toast').textContent.trim())`),
      };
    });
    expect(r.ready).toBe(true);
    expect(r.again.title).toBe(r.read.title);
    expect(r.home.title).toContain('Gleb Rosev');
    expect(r.unread).toMatchObject({ lang: 'en', path: '/writing/no-threejs-topology/', list: ['/writing/self-healing-monogram/'] });
    expect(r.unread.title).toContain(en.offline.title);
    // Offline in Russian: the Russian page, and the post read in English is not on its list.
    expect(r.unreadRu).toMatchObject({ lang: 'ru', list: [] });
    expect(r.unreadRu.title).toContain(ru.offline.title);
    expect(r.toast).toBe(ru.offline.toast);
  });
});

describe.skipIf(!hasChrome())('an update with a reading tab still open', () => {
  for (const lang of ['en', 'ru']) {
    test(`updated and previously visited ${lang} articles retain their own scripts offline`, async () => {
      await withChrome(async ({ send, evaluate }) => {
        const prefix = lang === 'en' ? '' : '/ru';
        const opened = prefix + '/writing/self-healing-monogram/';
        const previous = prefix + '/writing/no-threejs-topology/';
        let build = 'A';
        const optionalFetches: string[] = [];
        // Two deployments with different article entry points and transitive module URLs.
        const server = Bun.serve({ port: 0, async fetch(req) {
          let path = new URL(req.url).pathname;
          const response = (text: string, type: string) => new Response(text, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
          if (path === '/sw.js') return response(readFileSync('dist/sw.js', 'utf8').replace(/const VERSION = "[^"]+"/, `const VERSION = "test-${build}"`), 'text/javascript');
          if (path === '/_astro/entry.' + build + '.js') return response(`import "./child.${build}.js"; export const optional = () => import("./lazy.${build}.js");`, 'text/javascript');
          if (path.startsWith('/_astro/lazy.')) {
            optionalFetches.push(path);
            return response('export default true;', 'text/javascript');
          }
          if (path === '/_astro/child.' + build + '.js') return response(`document.documentElement.dataset.articleBuild = "${build}";`, 'text/javascript');
          if (path === opened || path === previous) {
            const html = readFileSync('dist' + path + 'index.html', 'utf8').replace('</head>', `<script type="module" src="/_astro/entry.${build}.js"></script></head>`);
            return response(html, 'text/html');
          }
          if (path.endsWith('/')) path += 'index.html';
          const file = Bun.file('dist' + path);
          return await file.exists() ? new Response(file) : new Response('Missing', { status: 404 });
        } });
        const waitFor = async (expression: string) => {
          for (let i = 0; i < 150; i++) {
            if (await evaluate(expression)) return;
            await Bun.sleep(80);
          }
          throw Error('Timed out waiting for ' + expression);
        };
        const go = (path: string) => send('Page.navigate', { url: server.url.origin + path });
        try {
          await send('Page.enable');
          await send('Network.enable');
          await send('Network.setCacheDisabled', { cacheDisabled: true });
          await go(previous);
          await waitFor("!!navigator.serviceWorker.controller && document.documentElement.dataset.articleBuild === 'A'");
          await go(opened);
          await waitFor(`location.pathname === '${opened}' && caches.match(location.pathname).then(Boolean)`);
          await evaluate("window.updates = 0; navigator.serviceWorker.addEventListener('controllerchange', () => window.updates++); true");
          build = 'B';
          await evaluate('navigator.serviceWorker.getRegistration().then(r => r.update()).then(() => true)');
          await waitFor("window.updates > 0 && navigator.serviceWorker.getRegistration().then(r => r.active?.state === 'activated')");
          expect(optionalFetches).toEqual([]);
          server.stop(true);
          for (const [path, expected] of [[opened, 'B'], [previous, 'A']]) {
            await go(path);
            await waitFor(`location.pathname === '${path}' && document.documentElement.dataset.articleBuild === '${expected}' && !!document.querySelector('[data-quote-bar]')`);
          }
        } finally { server.stop(true); }
      });
    });
  }
});
