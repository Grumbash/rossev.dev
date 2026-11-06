// A layer for insiders. The DevTools console greets an engineer and points at /how-its-built/; ?
// shows the shortcuts; j/k go to the next/previous post (on lists, between the cards); Alt+click on a
// block opens its source on GitHub: a post's own file, else the page's .astro. Every page names its
// source (<meta name="source">), a post page its neighbours (<link rel="next|prev">), all checked
// against the repo. Typing in a field is never a shortcut. In the page's language.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { BLOG_POSTS } from '../src/data/posts';
import { sourceUrl } from '../src/scripts/insiders';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome } from './fixtures/probe';
import { withChrome, type Cdp } from './fixtures/cdp';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

const read = (p: string) => readFileSync(`dist/${p}index.html`, 'utf8');
const meta = (html: string) => html.match(/<meta name="source" content="([^"]+)"/)?.[1];
const withBody = BLOG_POSTS.find((p) => p.body)!;
const plainPost = BLOG_POSTS.find((p) => !p.body)!;

describe('sources', () => {
  test('a repo path becomes its file on GitHub, brackets and all', () => {
    expect(sourceUrl('src/pages/[...locale]/hire.astro')).toBe('https://github.com/Grumbash/rossev.dev/blob/main/src/pages/%5B...locale%5D/hire.astro');
  });

  test('every page names its own .astro, and the file exists', () => {
    for (const p of ['', 'ru/', 'hire/', 'writing/', `writing/${withBody.slug}/`, 'how-its-built/']) {
      const src = meta(read(p));
      expect(src, p).toMatch(/^src\/pages\/.+\.astro$/);
      expect(existsSync(src!), src).toBe(true);
    }
    expect(meta(read('hire/'))).toBe('src/pages/[...locale]/hire.astro');
    expect(meta(read(''))).toBe('src/pages/[...locale]/index.astro');
  });

  test('a post names the file its words come from', () => {
    for (const [post, file] of [[withBody, `src/content/writing/${withBody.slug}.md`], [plainPost, `src/data/posts/${plainPost.slug}.json`]] as const) {
      const art = read(`writing/${post.slug}/`).match(/<article[^>]*data-quote-slug[^>]*>/)![0];
      expect(art).toContain(`data-src="${file}"`);
      expect(existsSync(file)).toBe(true);
    }
  });

  test('a post page links its neighbours, the order the Next button follows', () => {
    const i = BLOG_POSTS.indexOf(withBody);
    const n = BLOG_POSTS.length;
    const html = read(`writing/${withBody.slug}/`);
    expect(html).toContain(`<link rel="next" href="/writing/${BLOG_POSTS[(i + 1) % n].slug}/">`);
    expect(html).toContain(`<link rel="prev" href="/writing/${BLOG_POSTS[(i - 1 + n) % n].slug}/">`);
    expect(read(`ru/writing/${withBody.slug}/`)).toContain(`<link rel="next" href="/ru/writing/${BLOG_POSTS[(i + 1) % n].slug}/">`);
  });

  test('the words are on the toast element, in the page language', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const toast = read(prefix).match(/<div[^>]*id="brutal-toast"[^>]*>/)![0];
      expect(toast).toContain(`data-keys-title="${d.keys.title}"`);
      expect(toast).toContain(`data-keys-hello="${d.keys.hello}"`);
    }
  });
});

describe.skipIf(!hasChrome())('in the browser', () => {
  const open = async (cdp: Cdp, path: string) => {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `${cdp.origin}${path}` });
    await Bun.sleep(1800);
  };
  const press = async ({ send }: Cdp, key: string, text = key) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key });
    await Bun.sleep(400);
  };

  test('the console greets in the page language and points at /how-its-built/', async () => {
    const logs: string[] = [];
    await withChrome(async (cdp) => {
      cdp.on((m, p) => m === 'Runtime.consoleAPICalled' && logs.push(p.args.map((a: { value?: unknown }) => String(a.value ?? '')).join(' ')));
      await cdp.send('Runtime.enable');
      await open(cdp, '/ru/');
    });
    const hello = logs.find((l) => l.includes(ru.keys.hello));
    expect(hello).toBeDefined();
    expect(hello).toContain('https://rossev.dev/ru/how-its-built/');
  });

  test('? shows the shortcuts, Escape closes them; typing ? in a field does not', async () => {
    const r = await withChrome(async (cdp) => {
      await open(cdp, '/');
      await press(cdp, '?');
      const shown = await cdp.evaluate(`document.querySelector('[data-keys]')?.textContent ?? null`);
      await press(cdp, 'Escape', '');
      const closed = await cdp.evaluate(`!document.querySelector('[data-keys]')`);
      await cdp.evaluate(`(() => { const i = document.createElement('input'); i.id = 't'; document.body.append(i); i.focus(); })()`);
      await press(cdp, '?');
      const typed = await cdp.evaluate(`!document.querySelector('[data-keys]')`);
      return { shown, closed, typed };
    });
    expect(r.shown).toContain(en.keys.title);
    expect(r.shown).toContain(en.keys.posts);
    expect(r.closed).toBe(true);
    expect(r.typed).toBe(true);
  });

  test('j and k go to the next and previous post', async () => {
    const i = BLOG_POSTS.indexOf(withBody);
    const n = BLOG_POSTS.length;
    const r = await withChrome(async (cdp) => {
      await open(cdp, `/writing/${withBody.slug}/`);
      await press(cdp, 'j');
      await Bun.sleep(1500);
      const afterJ = await cdp.evaluate('location.pathname');
      await press(cdp, 'k');
      await Bun.sleep(1500);
      return { afterJ, afterK: await cdp.evaluate('location.pathname') };
    });
    expect(r.afterJ).toBe(`/writing/${BLOG_POSTS[(i + 1) % n].slug}/`);
    expect(r.afterK).toBe(`/writing/${withBody.slug}/`);
  });

  test('on a list, j and k move between the cards', async () => {
    const r = await withChrome(async (cdp) => {
      await open(cdp, '/writing/');
      await press(cdp, 'j');
      const first = await cdp.evaluate(`document.activeElement?.closest('.post-card')?.dataset.slug ?? null`);
      await press(cdp, 'j');
      const second = await cdp.evaluate(`document.activeElement?.closest('.post-card')?.dataset.slug ?? null`);
      await press(cdp, 'k');
      const back = await cdp.evaluate(`document.activeElement?.closest('.post-card')?.dataset.slug ?? null`);
      const slugs = await cdp.evaluate(`[...document.querySelectorAll('.post-card')].slice(0, 2).map((c) => c.dataset.slug)`);
      return { first, second, back, slugs };
    });
    expect([r.first, r.second, r.back]).toEqual([r.slugs[0], r.slugs[1], r.slugs[0]]);
  });

  test('Alt+click on a post opens its file on GitHub; elsewhere, the page’s .astro', async () => {
    const r = await withChrome(async (cdp) => {
      await open(cdp, `/writing/${withBody.slug}/`);
      await cdp.evaluate(`window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }`);
      const click = async (sel: string) => {
        const b = await cdp.evaluate(`(() => { const e = document.querySelector('${sel}'); e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); return { x: r.left + 5, y: r.top + r.height / 2 }; })()`);
        for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1, modifiers: 1 });
        await Bun.sleep(300);
      };
      await click('.post-body p');
      await click('.site-footer .footer-fineprint');
      return { opened: await cdp.evaluate('window.__opened'), path: await cdp.evaluate('location.pathname') };
    });
    expect(r.opened).toEqual([sourceUrl(`src/content/writing/${withBody.slug}.md`), sourceUrl('src/pages/[...locale]/writing/[slug].astro')]);
    expect(r.path).toBe(`/writing/${withBody.slug}/`);
  });
});
