// Print as magic. Ctrl+P on /hire gives a one-page CV from the same profile.ts as the PDF; a post
// prints as a brutalist newspaper page: a masthead with the post's address, the headline, the text in
// two ruled columns with a drop cap, every outside link's address printed after it, no menus, footer
// or companion. The print styles are /print.css behind media="print": nothing on screen and nothing
// in the inline CSS budget. The print-only blocks are `hidden` on screen, so they need no CSS there.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { BLOG_POSTS } from '../src/data/posts';
import { EXPERIENCE, PROFILE } from '../src/data/profile';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { buildSite } from './fixtures/build';
import { hasChrome } from './fixtures/probe';
import { withChrome, type Cdp } from './fixtures/cdp';

setDefaultTimeout(120_000);

beforeAll(() => buildSite());

const LINK = /<link[^>]*rel="stylesheet"[^>]*href="\/print\.css"[^>]*media="print"[^>]*>/;
const post = BLOG_POSTS.filter((p) => p.body).sort((a, b) => b.body!.en.length - a.body!.en.length)[0];
const read = (p: string) => readFileSync(`dist/${p}index.html`, 'utf8');

describe('the build', () => {
  test('every page links /print.css for print only; the inline CSS no longer carries print rules', () => {
    expect(existsSync('dist/print.css')).toBe(true);
    for (const p of ['', 'ru/', 'hire/', 'ru/hire/', `writing/${post.slug}/`]) expect(read(p)).toMatch(LINK);
    const inline = [...read('').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('');
    expect(inline).not.toContain('@media print');
  });

  test('/hire carries the CV, hidden on screen, in the page language', () => {
    for (const [prefix, lang, d] of [['', 'en', en], ['ru/', 'ru', ru]] as const) {
      const cv = read(`${prefix}hire/`).match(/<section[^>]*class="print-cv"[^>]*>[\s\S]*?<\/section>/)![0];
      expect(cv).toMatch(/^<section[^>]*\bhidden\b/);
      for (const s of [PROFILE.name[lang], PROFILE.email, PROFILE.phone, PROFILE.linkedinHandle, PROFILE.githubHandle, d.print.experience, d.print.skills])
        expect(cv).toContain(s);
      for (const e of EXPERIENCE) expect(cv).toContain(e.company.replace(/&/g, '&amp;'));
    }
  });

  test('a post carries a masthead with its own address, hidden on screen', () => {
    for (const [prefix, d] of [['', en], ['ru/', ru]] as const) {
      const head = read(`${prefix}writing/${post.slug}/`).match(/<header[^>]*class="print-masthead"[^>]*>[\s\S]*?<\/header>/)![0];
      expect(head).toMatch(/^<header[^>]*\bhidden\b/);
      expect(head).toContain(d.print.masthead);
      expect(head).toContain(`rossev.dev/${prefix}writing/${post.slug}/`);
    }
  });
});

describe.skipIf(!hasChrome())('printed, in Chrome', () => {
  const open = async (cdp: Cdp, path: string) => {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `${cdp.origin}${path}` });
    await Bun.sleep(1500);
  };
  const pages = async (cdp: Cdp, paperWidth: number, paperHeight: number) => {
    const { data } = await cdp.send('Page.printToPDF', { paperWidth, paperHeight, printBackground: true });
    return (Buffer.from(data, 'base64').toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  };
  const shown = (sel: string) => `(() => { const e = document.querySelector('${sel}'); return !!e && e.checkVisibility(); })()`;

  test('/hire is one page, on A4 and on Letter, in both languages: the CV and nothing else', async () => {
    const r = await withChrome(async (cdp) => {
      const out: Record<string, unknown> = {};
      for (const path of ['/hire/', '/ru/hire/']) {
        await open(cdp, path);
        out[`${path} screen`] = await cdp.evaluate(shown('.print-cv'));
        out[`${path} A4`] = await pages(cdp, 8.27, 11.69);
        out[`${path} Letter`] = await pages(cdp, 8.5, 11);
        await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
        out[`${path} cv`] = await cdp.evaluate(shown('.print-cv'));
        out[`${path} offers`] = await cdp.evaluate(shown('.hire-offers'));
        out[`${path} nav`] = await cdp.evaluate(shown('.top-nav'));
        out[`${path} footer`] = await cdp.evaluate(shown('.site-footer'));
        await cdp.send('Emulation.setEmulatedMedia', { media: '' });
      }
      return out;
    });
    for (const path of ['/hire/', '/ru/hire/'])
      expect([r[`${path} screen`], r[`${path} A4`], r[`${path} Letter`], r[`${path} cv`], r[`${path} offers`], r[`${path} nav`], r[`${path} footer`]]).toEqual([false, 1, 1, true, false, false, false]);
  });

  test('a post prints as a newspaper page: masthead, two ruled columns, a drop cap, link addresses; no menus, footer or companion', async () => {
    const r = await withChrome(async (cdp) => {
      await open(cdp, `/writing/${post.slug}/`);
      const screen = await cdp.evaluate(shown('.print-masthead'));
      await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
      const out = await cdp.evaluate(`(() => {
        const body = getComputedStyle(document.querySelector('.post-body'));
        const first = document.querySelector('.post-body > p');
        const link = document.querySelector('.post-body a[href^="http"]');
        return {
          masthead: ${shown('.print-masthead')},
          nav: ${shown('.top-nav')},
          footer: ${shown('.site-footer')},
          back: ${shown('section .container > a.text-link')},
          columns: body.columnCount,
          rule: body.columnRuleStyle,
          dropCap: parseFloat(getComputedStyle(first, '::first-letter').fontSize) > 2 * parseFloat(getComputedStyle(first).fontSize),
          linkAfter: link ? getComputedStyle(link, '::after').content : null,
          linkHref: link ? link.getAttribute('href') : null,
        };
      })()`);
      return { screen, ...out, pages: await pages(cdp, 8.27, 11.69) };
    });
    expect(r).toMatchObject({ screen: false, masthead: true, nav: false, footer: false, back: false, columns: '2', rule: 'solid', dropCap: true });
    if (r.linkHref) expect(r.linkAfter).toContain(r.linkHref);
    expect(r.pages).toBeGreaterThanOrEqual(1);
  });
});
