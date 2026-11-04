// The writing must be findable and must not be a dead end. Every post gets its own static page
// that a crawler can index and a reader can share; the home grid links to those pages with real
// hrefs; the brief, inline or on its page, offers a next step; HTMX fragments stay out of the
// index. Checks the built output and the deploy config, not the source.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { BLOG_POSTS, PROFILE, blogPostingLd, cardReadTime, fullPostLink, linkedinLabel, readTimeLabel } from '../src/data/profile';
import { bodyBlocks, bodyHtml } from '../src/data/post-body';
import budgets from '../perf-budgets.json';
import { evaluateBytes, type Check } from '../scripts/perf-check';

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

const SITE = 'https://rossev.dev';
const PERSON = `${SITE}/#person`;
const pagePath = (slug: string) => `/writing/${slug}/`;
const read = (p: string) => readFileSync(p, 'utf8');

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

const meta = (html: string, key: string) =>
  html.match(new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*content="([^"]*)"`))?.[1] ??
  html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*(?:name|property)="${key}"`))?.[1];
const canonical = (html: string) => html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1];
const title = (html: string) => html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
const graph = (html: string): any[] => {
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  if (!raw) return [];
  const ld = JSON.parse(raw);
  return ld['@graph'] ?? [ld];
};
// Every entity Astro may emit: post titles and texts carry quotes, &, < and > (&#34;, &#38;, &lt;).
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
// text() collapses whitespace, so expected strings are compared the same way.
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const text = (html: string) =>
  decode(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

// LinkedIn activity ids are snowflakes: the top bits are the ms timestamp of publication.
// Vanity urls carry it as share-<id>; feed urls of synced posts as urn:li:share:<id>.
const linkedinDate = (url: string) => {
  const id = url.match(/(?:share|ugcPost|activity)[-:](\d{15,})/)?.[1];
  return id ? new Date(Number(BigInt(id) >> 22n)).toISOString().slice(0, 10) : undefined;
};

// The brief footer every reader gets, inline or on the post page.
function expectReaderFooter(html: string, i: number) {
  const post = BLOG_POSTS[i];
  const next = BLOG_POSTS[(i + 1) % BLOG_POSTS.length];
  const tags = controls(html);

  const nextLink = tags.find((t) => t.tag === 'a' && t.attrs.href === pagePath(next.slug));
  expect(nextLink, `next link to ${next.slug}`).toBeDefined();
  // Moving on to the next post is an open, whether it swaps inline or navigates.
  expect(nextLink!.attrs['data-track']).toBe('post_open');
  expect(nextLink!.attrs['data-track-id']).toBe(next.id);
  expect(text(html)).toContain(squash(next.title.en));

  const copy = tags.find((t) => Object.values(t.attrs).some((v) => v.includes(`${SITE}${pagePath(post.slug)}`)) && t.tag === 'button');
  expect(copy, 'copy-link button carrying the post page url').toBeDefined();

  const cal = tags.filter((t) => t.attrs.href?.includes('cal.com'));
  expect(cal.length).toBe(1);
  const u = new URL(cal[0].attrs.href);
  expect(u.searchParams.get('utm_content')).toBe('reader');
  expect(u.searchParams.get('utm_source')).toBe('rossev.dev');
  expect(cal[0].attrs['data-track']).toBe('cta_book');
  expect(cal[0].attrs['data-track-placement']).toBe('reader');

  const follow = tags.find((t) => t.attrs.href === PROFILE.linkedin);
  expect(follow?.attrs['data-track']).toBe('linkedin_click');
  expect(follow?.attrs['data-track-placement']).toBe('reader');

  // A post first published here has no LinkedIn copy to point at.
  if (post.url) {
    const original = tags.find((t) => t.attrs.href === post.url);
    expect(original?.attrs['data-track']).toBe('post_linkedin');
    expect(original?.attrs['data-track-id']).toBe(post.id);
  } else expect(tags.some((t) => t.attrs['data-track'] === 'post_linkedin')).toBe(false);
}

let pages: Record<string, string> = {};
// The Russian twin of each post page, /ru/writing/<slug>/.
let ruPages: Record<string, string> = {};
let partials: Record<string, string> = {};
let home = '';
// Home's HTML plus the first-party scripts it loads: page code ships as bundled modules.
let homeCode = '';
let grid = '';
// Home and its grid partials show the 6 latest posts; /writing/ lists them all.
const latest = [...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published)).slice(0, 6);

beforeAll(() => {
  execSync('bun run build', { stdio: 'ignore' });
  home = read('dist/index.html');
  const srcs = [...home.matchAll(/<script\b[^>]*\ssrc="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
  const chunks = existsSync('dist/_astro') ? readdirSync('dist/_astro').filter((f) => f.endsWith('.js')).map((f) => `/_astro/${f}`) : [];
  homeCode = [home, ...[...new Set([...srcs, ...chunks])].map((u) => read(`dist${u}`))].join('\n');
  grid = read('dist/partials/posts-all/index.html');
  for (const p of BLOG_POSTS) {
    const file = `dist/writing/${p.slug}/index.html`;
    pages[p.slug] = existsSync(file) ? read(file) : '';
    ruPages[p.slug] = existsSync(`dist/ru${pagePath(p.slug)}index.html`) ? read(`dist/ru${pagePath(p.slug)}index.html`) : '';
    partials[p.id] = read(`dist/partials/post-${p.id}/index.html`);
  }
});

describe('post data', () => {
  // No post has a body yet (the Publora sync adds them), so the page logic is pinned here on a fixture.
  test('with the full text here, every label and the JSON-LD treat the site as the original', () => {
    const linked = BLOG_POSTS.find((p) => p.url)!;
    const stub = { ...linked, body: undefined };
    const full = { ...linked, body: { en: 'The text.', ru: 'Текст.' } };
    const n = stub.originalMinutes;
    expect(cardReadTime(stub)).toEqual({ en: `${n}-MIN ORIGINAL`, ru: `ОРИГИНАЛ ${n} МИН` });
    expect(cardReadTime(full)).toEqual({ en: `${n}-MIN FULL POST`, ru: `ПОЛНЫЙ ТЕКСТ ${n} МИН` });
    expect(linkedinLabel(stub)).toEqual({ en: 'ORIGINAL POST ON LINKEDIN ↗', ru: 'ОРИГИНАЛ В LINKEDIN ↗' });
    expect(linkedinLabel(full)).toEqual({ en: 'ALSO ON LINKEDIN ↗', ru: 'ТАКЖЕ В LINKEDIN ↗' });
    // The inline reader shows the brief only, so it links to the page that has the text.
    expect(fullPostLink(full, true)).toEqual({ href: pagePath(full.slug), en: 'READ THE FULL POST →', ru: 'ЧИТАТЬ ПОЛНОСТЬЮ →' });
    expect(fullPostLink(full, false)).toBeNull();
    expect(fullPostLink(stub, true)).toBeNull();
    const url = `${SITE}${pagePath(full.slug)}`;
    const ldStub = blogPostingLd(stub, url, `${SITE}/og-card.png`);
    const ldFull = blogPostingLd(full, url, `${SITE}/og-card.png`);
    expect(ldStub.isBasedOn).toBe(stub.url);
    expect(ldFull.isBasedOn).toBeUndefined();
    expect(ldFull.sameAs).toBe(full.url);
    expect(ldFull.author).toEqual({ '@id': PERSON });
    expect(ldFull.url).toBe(url);
  });

  test('a post first published here claims no LinkedIn original or copy', () => {
    const own = { ...BLOG_POSTS[0], url: undefined, body: { en: 'The text.', ru: 'Текст.' } };
    expect(linkedinLabel(own)).toBeNull();
    const ld = blogPostingLd(own, `${SITE}${pagePath(own.slug)}`, `${SITE}/og-card.png`);
    expect(ld.isBasedOn).toBeUndefined();
    expect(ld.sameAs).toBeUndefined();
  });

  test('the full text renders a small Markdown subset and nothing it was not meant to', () => {
    const html = bodyHtml(
      'One <b> & *it* **bold** `a*b*<c>`\nsame [link](https://x.dev/a) [bad](javascript:alert(1))\n\n## Head\n\n- one\n- two\n\n- a\nnot a list'
    );
    expect(html).toBe(
      [
        '<p>One &lt;b&gt; &amp; <em>it</em> <strong>bold</strong> <code>a*b*&lt;c&gt;</code> same <a class="text-link" href="https://x.dev/a" target="_blank" rel="noopener noreferrer">link</a> [bad](javascript:alert(1))</p>',
        '<h2>Head</h2>',
        '<ul><li>one</li><li>two</li></ul>',
        '<p>- a not a list</p>',
      ].join('\n')
    );
  });

  test('JSON-LD cannot close its <script>: model-written titles go through it', () => {
    expect(read('src/layouts/Base.astro')).toMatch(/JSON\.stringify\(jsonLd\)\.replace\(\/<\/g, '\\\\u003c'\)/);
  });

  test('the templates take those labels and the JSON-LD from the shared helpers', () => {
    expect(read('src/components/BlogGrid.astro')).toContain('cardReadTime(post)');
    expect(read('src/components/BlogGrid.astro')).not.toMatch(/MIN ORIGINAL/);
    expect(read('src/components/PostBrief.astro')).toContain('linkedinLabel(post)');
    expect(read('src/components/PostBrief.astro')).toContain('fullPostLink(post, inline)');
    expect(read('src/pages/[...locale]/writing/[slug].astro')).toContain('blogPostingLd(post');
  });

  test('the read time is honest about where the text is: the original on LinkedIn, or the full post here', () => {
    const stub = BLOG_POSTS[0];
    expect(readTimeLabel({ ...stub, body: undefined })).toEqual({ en: `30-SEC BRIEF · ${stub.originalMinutes}-MIN ORIGINAL`, ru: `КОНСПЕКТ НА 30 СЕК · ОРИГИНАЛ ${stub.originalMinutes} МИН` });
    expect(readTimeLabel({ ...stub, body: { en: 'a', ru: 'б' } })).toEqual({ en: `30-SEC BRIEF · ${stub.originalMinutes}-MIN FULL POST`, ru: `КОНСПЕКТ НА 30 СЕК · ПОЛНЫЙ ТЕКСТ ${stub.originalMinutes} МИН` });
  });

  test('slugs are unique, url-safe, and every post has a publication date matching its LinkedIn id', () => {
    const slugs = BLOG_POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of BLOG_POSTS) {
      expect(p.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect((p as any).published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (p.url) expect((p as any).published).toBe(linkedinDate(p.url));
      // A post first published here is the site's own, so it carries its full text.
      else expect(p.body).toBeDefined();
    }
  });
});

describe('every post has an indexable page', () => {
  for (const [i, p] of BLOG_POSTS.entries()) {
    describe(p.slug, () => {
      const html = () => pages[p.slug];
      const url = `${SITE}${pagePath(p.slug)}`;

      test('exists with its own title, description and canonical', () => {
        expect(html(), `dist/writing/${p.slug}/index.html`).not.toBe('');
        expect(decode(title(html()) ?? '')).toContain(p.title.en);
        expect(canonical(html())).toBe(url);
        expect(meta(html(), 'description')?.length ?? 0).toBeGreaterThan(40);
        expect(meta(html(), 'robots') ?? '').not.toContain('noindex');
      });

      test('shares with its own title and url', () => {
        expect(meta(html(), 'og:url')).toBe(url);
        expect(decode(meta(html(), 'og:title') ?? '')).toContain(p.title.en);
        expect(meta(html(), 'og:type')).toBe('article');
        expect(meta(html(), 'og:image')).toMatch(/^https:\/\/rossev\.dev\/.+\.png$/);
        expect(meta(html(), 'twitter:card')).toBe('summary_large_image');
      });

      test('BlogPosting JSON-LD is authored by the Person and based on the LinkedIn original', () => {
        const post = graph(html()).find((n) => n['@type'] === 'BlogPosting');
        expect(post).toBeDefined();
        expect(post.author?.['@id']).toBe(PERSON);
        expect(post.url).toBe(url);
        expect(post.mainEntityOfPage?.['@id'] ?? post.mainEntityOfPage).toBe(url);
        expect(post.headline).toBe(p.title.en);
        expect(post.datePublished).toBe((p as any).published);
        if (p.url) expect([post.isBasedOn, post.sameAs].flat()).toContain(p.url);
        else expect([post.isBasedOn, post.sameAs]).toEqual([undefined, undefined]);
        // With the full text here, this page is the original and LinkedIn a copy of it.
        if ((p as any).body) expect(post.isBasedOn).toBeUndefined();
      });

      test('shows the brief in both languages (EN here, RU on /ru/) with an honest read time', () => {
        const t = text(html());
        const ru = text(ruPages[p.slug]);
        expect(t).toContain(squash(p.title.en));
        expect(ru).toContain(squash(p.title.ru));
        expect(t).toMatch(/30-sec brief/i);
        // The minutes describe the LinkedIn original, so they come from the data, not a constant.
        const min = (p as any).originalMinutes;
        expect(min).toBeGreaterThan(0);
        expect(ru).toMatch(/30 сек/i);
        expect(ru).toMatch(new RegExp(`${min} мин`, 'i'));
        const body = (p as any).body as { en: string; ru: string } | undefined;
        if (body) {
          // The full text is on this page; LinkedIn is where it was also posted.
          expect(t).toMatch(new RegExp(`${min}-min full post`, 'i'));
          expect(t).not.toMatch(/original post on linkedin/i);
          if (p.url) {
            expect(t).toMatch(/also on linkedin/i);
            expect(ru).toMatch(/также в linkedin/i);
          } else expect(t).not.toMatch(/(also|original post) on linkedin/i);
          for (const [page, s] of [[t, body.en], [ru, body.ru]]) {
            const blocks = bodyBlocks(s);
            expect(page).toContain(squash(text(bodyHtml(blocks[0]))));
            expect(page).toContain(squash(text(bodyHtml(blocks[blocks.length - 1]))));
          }
        } else expect(t).toMatch(new RegExp(`${min}-min original`, 'i'));
        // One source for the brief: the inline reader and the page render the same bullets.
        const bullets = [...partials[p.id].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]).trim());
        expect(bullets.length).toBeGreaterThan(0);
        for (const b of bullets) expect(t).toContain(b);
      });

      test('has the same chrome as home: theme + language switch and the funnel analytics', () => {
        const tags = controls(html());
        // One switch: a link to the same post in the other language.
        expect(tags.filter((t) => t.attrs['data-track'] === 'lang_switch').map((t) => t.attrs.href)).toEqual([`/ru${pagePath(p.slug)}`]);
        expect(tags.filter((t) => t.attrs['data-track'] === 'theme_switch').length).toBe(1);
        expect(tags.some((t) => t.attrs.href === '/' || t.attrs.href === `${SITE}/`)).toBe(true);
      });

      test('ends with a next step', () => expectReaderFooter(html(), i));
    });
  }

  test('titles and descriptions are unique across posts and differ from home', () => {
    const titles = BLOG_POSTS.map((p) => title(pages[p.slug]));
    const descs = BLOG_POSTS.map((p) => meta(pages[p.slug], 'description'));
    expect(new Set(titles).size).toBe(BLOG_POSTS.length);
    expect(new Set(descs).size).toBe(BLOG_POSTS.length);
    expect(titles).not.toContain(title(home));
  });
});

describe('writing index', () => {
  test('/writing/ lists every post page and is canonical', () => {
    const html = read('dist/writing/index.html');
    expect(canonical(html)).toBe(`${SITE}/writing/`);
    const hrefs = controls(html).map((t) => t.attrs.href);
    for (const p of BLOG_POSTS) expect(hrefs).toContain(pagePath(p.slug));
  });
});

describe('inline reader', () => {
  for (const [i, p] of BLOG_POSTS.entries()) {
    test(`${p.id} ends with a next step and injects no robots meta into home`, () => {
      // The fragment is swapped into home's body; a noindex meta there could deindex home.
      // /partials/* is kept out of the index by the X-Robots-Tag header instead.
      expect(meta(partials[p.id], 'robots')).toBeUndefined();
      expectReaderFooter(partials[p.id], i);
    });
  }
});

describe('grid cards are crawlable links that still open the inline reader', () => {
  for (const [name, html] of [['home', () => home], ['posts-all partial', () => grid]] as const) {
    test(name, () => {
      const tags = controls(html());
      for (const p of latest) {
        const card = tags.find((t) => t.tag === 'a' && t.attrs.href === pagePath(p.slug));
        expect(card, `<a href="${pagePath(p.slug)}">`).toBeDefined();
        expect(card!.attrs['data-track']).toBe('post_open');
        expect(card!.attrs['data-track-id']).toBe(p.id);
        expect(card!.attrs['hx-get']).toBe(`/partials/post-${p.id}`);
        // htmx cancels every click on an <a href hx-get>, so a plain click must reach htmx through
        // a custom trigger that modifier clicks never fire; otherwise cmd-click can't open a tab.
        expect(card!.attrs['hx-trigger']).toBe('open-brief');
        expect(card!.attrs['data-action']).toBe('openBrief');
      }
      // No post opener is a bare button any more.
      expect(tags.filter((t) => t.tag === 'button' && t.attrs['data-track'] === 'post_open')).toEqual([]);
    });
  }
  test('home defines openBrief, which skips modifier clicks', () => {
    const fn = homeCode.match(/openBrief\s*=[\s\S]{0,600}/)?.[0] ?? '';
    expect(fn).not.toBe('');
    for (const k of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey', 'button']) expect(fn).toContain(k);
  });
});

describe('old ?post= links', () => {
  test('client-side restore accepts any post number, not just 1-9', () => {
    expect(homeCode).not.toContain('^post-[1-9]$');
    expect(homeCode).toMatch(/post-\\d\+/);
  });

  // Only post-1..9 ever had ?post= links; posts added later (the Publora sync) never did.
  test('vercel 301-redirects each legacy /?post=<id> to its page, matching the id exactly', () => {
    const cfg = JSON.parse(read('vercel.json'));
    for (const p of BLOG_POSTS.filter((p) => Number(p.id.replace('post-', '')) <= 9)) {
      const r = (cfg.redirects ?? []).find(
        (x: any) => x.source === '/' && x.has?.some((h: any) => h.type === 'query' && h.key === 'post' && h.value === `^${p.id}$`),
      );
      expect(r, `redirect for ${p.id}`).toBeDefined();
      expect(r.destination).toBe(pagePath(p.slug));
      // has.value is a regex: unanchored, post-1 would also catch post-10.
      expect(new RegExp(r.has[0].value).test(`${p.id}0`)).toBe(false);
      expect(r.statusCode).toBe(301);
    }
  });
});

describe('crawl control', () => {
  test('vercel marks /partials/* noindex', () => {
    const cfg = JSON.parse(read('vercel.json'));
    const h = (cfg.headers ?? []).find((x: any) => x.source === '/partials/(.*)');
    const tag = h?.headers?.find((x: any) => x.key.toLowerCase() === 'x-robots-tag');
    expect(tag?.value).toContain('noindex');
  });

  test('the sitemap lists home, the writing index and every post, and no partials', () => {
    expect(existsSync('dist/sitemap-index.xml')).toBe(true);
    const locs = readdirSync('dist')
      .filter((f) => /^sitemap.*\.xml$/.test(f))
      .flatMap((f) => [...read(`dist/${f}`).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    expect(locs).toContain(`${SITE}/`);
    expect(locs).toContain(`${SITE}/writing/`);
    for (const p of BLOG_POSTS) expect(locs).toContain(`${SITE}${pagePath(p.slug)}`);
    expect(locs.filter((l) => l.includes('/partials/'))).toEqual([]);
  });

  test('robots.txt points at the sitemap', () => {
    expect(read('dist/robots.txt')).toMatch(/^Sitemap: https:\/\/rossev\.dev\/sitemap-index\.xml$/m);
  });
});

describe('post pages are held to the byte budgets too', () => {
  test('html-gzip is checked for every post page and each is within budget', () => {
    const checks: Check[] = evaluateBytes('dist', budgets.bytes);
    const html = checks.filter((c) => c.name === 'html-gzip');
    const files = html.flatMap((c) => c.files);
    for (const p of BLOG_POSTS) expect(files).toContain(`writing/${p.slug}/index.html`);
    expect(files).toContain('writing/index.html');
    // The Russian copies count too.
    expect(files).toContain('ru/index.html');
    for (const p of BLOG_POSTS) expect(files).toContain(`ru/writing/${p.slug}/index.html`);
    for (const c of html) expect(c.ok, `${c.files.join(',')}: ${c.actual} > ${c.limit}`).toBe(true);
  });
});

describe('filter tabs', () => {
  // A reader who clicks a filter should see cards stamped with the word they clicked.
  test('each category filter is labelled like its cards, in both languages', () => {
    const tabsOf = (html: string) => [...html.matchAll(/<button\b[^>]*data-track-filter="(\w+)"[^>]*>([\s\S]*?)<\/button>/g)];
    const tabs = tabsOf(home);
    const ruTabs = tabsOf(read('dist/ru/index.html'));
    const categories = [...new Set(BLOG_POSTS.map((p) => p.category))];
    for (const c of categories) {
      const tab = tabs.find((m) => m[1] === c);
      expect(tab, `filter tab for ${c}`).toBeDefined();
      const label = BLOG_POSTS.find((p) => p.category === c)!.categoryLabel;
      const en = tab![2];
      const ru = ruTabs.find((m) => m[1] === c)?.[2];
      expect(decode(en ?? '').trim().toUpperCase(), `${c} en`).toBe(label.en);
      expect(decode(ru ?? '').trim().toLocaleUpperCase('ru'), `${c} ru`).toBe(label.ru);
    }
  });
});
