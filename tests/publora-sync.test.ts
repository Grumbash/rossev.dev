// A LinkedIn post published through Publora shows up on rossev.dev without Gleb touching the
// repo: a daily GitHub Action (.github/workflows/publora-sync.yml) runs
// scripts/ci/publora-sync.ts, which lists published LinkedIn posts in Publora, skips the ones
// already on the site (matched by the numeric LinkedIn activity id, since the site keeps vanity
// URLs), asks a cheap OpenRouter model for the site entry (EN brief + RU adaptation of the full
// text) under a strict JSON schema, rejects anything invalid or with numbers the post never
// said, and writes each entry to its own file in src/data/posts/. The workflow opens or updates ONE PR;
// nothing new means no commit and no PR. Publora and OpenRouter are mocked here.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import type { BlogPost } from '../src/data/profile';
import { BLOG_POSTS, postFile, postJson } from '../src/data/posts';
import { postsAfter } from './fixtures/posts';
import {
  CATEGORY_LABELS,
  systemPrompt,
  DEFAULT_MODEL,
  DEFAULT_SINCE,
  RUN_BUDGET_MS,
  activityId,
  buildEntry,
  checkEntry,
  sitePostLinkedFrom,
  cleanSource,
  linkedinTargets,
  parseListPosts,
  publishedDate,
  run,
  uniqueSlug,
  validateDraft,
} from '../scripts/ci/publora-sync';
import { callOpenRouter } from '../scripts/ci/openrouter';

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

// --- fixtures ----------------------------------------------------------------------------------

// Snowflake ids: the top bits are the ms timestamp (2026-11-02, 2026-11-03, 2026-09-01).
const NEW_ID = '7522945597440012345';
const PARTIAL_ID = '7523353283788812345';
const OLD_ID = '7500492649267212345';
const ON_SITE_ID = '7515722598857650176'; // post-1, already on the site under a vanity URL

const NEW_TEXT = [
  'Most teams do not have a velocity problem. They have a waiting problem.',
  '',
  "I looked at 3 weeks of pull requests in @{urn:li:person:ACoAABcD1234EfG|Anna Ivanova}'s team: 70% of lead time was PRs waiting for a reviewer.",
  '',
  'Fix the queue before you hire.',
  '',
  '#EngineeringManagement #Flow',
].join('\n');
const PARTIAL_TEXT = 'Ownership is not on-call.\n\nOwning a system means you decide what pages you, and you delete alerts nobody acts on.';

const li = (postedId: string | null, status: string, content: string, permalink: string | null = null) => ({
  platform: 'linkedin',
  platformId: 'ABC123',
  content,
  status,
  postedId,
  permalink,
});
const x = (status: string, content: string) => ({ platform: 'twitter', platformId: '999', content, status, postedId: status === 'published' ? '1' : null, permalink: null });

type Group = { postGroupId: string; status: string; posts: ReturnType<typeof li>[] };
const GROUPS: Group[] = [
  { postGroupId: 'g-new', status: 'published', posts: [li(`urn:li:share:${NEW_ID}`, 'published', NEW_TEXT)] },
  { postGroupId: 'g-on-site', status: 'published', posts: [li(`urn:li:share:${ON_SITE_ID}`, 'published', 'Engineering management is applied systems thinking.')] },
  { postGroupId: 'g-old', status: 'published', posts: [li(`urn:li:ugcPost:${OLD_ID}`, 'published', 'An old post from September.')] },
  {
    postGroupId: 'g-partial',
    status: 'partially_published',
    posts: [li(`urn:li:ugcPost:${PARTIAL_ID}`, 'published', PARTIAL_TEXT, `https://www.linkedin.com/posts/rossev_ownership-ugcPost-${PARTIAL_ID}-AbCd`), x('failed', 'short')],
  },
  { postGroupId: 'g-li-failed', status: 'partially_published', posts: [li(null, 'failed', 'LinkedIn refused this one.'), x('published', 'ok')] as any },
];

const listItem = (g: Group) => ({
  postGroupId: g.postGroupId,
  content: g.posts[0].content,
  status: g.status,
  scheduledTime: '2026-11-02T09:00:00.000Z',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-02T09:00:00.000Z',
  platforms: g.posts.map((p) => ({ platformId: `${p.platform}-${p.platformId}`, platform: p.platform, status: p.status })),
  mediaUrls: [],
});

const DRAFT_NEW = {
  slug: 'velocity-is-a-waiting-problem',
  category: 'delivery',
  tags: ['Flow', 'Code Review'],
  title: { en: 'Your Team Has a Waiting Problem, Not a Velocity Problem', ru: 'У команды проблема не со скоростью, а с ожиданием' },
  takeaway: { en: 'Fix the review queue before you hire more engineers.', ru: 'Почините очередь на ревью, прежде чем нанимать людей.' },
  quote: { en: 'Fix the queue before you hire.', ru: 'Сначала почините очередь, потом нанимайте.' },
  bullets: {
    en: [
      'Over 3 weeks of pull requests, 70% of lead time was PRs waiting for a reviewer.',
      'Slow delivery is usually queueing, not people typing slowly.',
      'Shorten the review queue before adding headcount.',
    ],
    ru: [
      'За 3 недели пул-реквестов 70% времени поставки ушло на ожидание ревьюера.',
      'Медленная поставка — это обычно очередь, а не медленная работа людей.',
      'Сократите очередь на ревью до того, как расширять команду.',
    ],
  },
  bodyRu: 'У большинства команд нет проблемы со скоростью. У них проблема с ожиданием.\n\nЯ посмотрел 3 недели пул-реквестов в команде Анны Ивановой: 70% времени поставки PR ждали ревьюера.\n\nСначала почините очередь, потом нанимайте.',
};
const DRAFT_PARTIAL = {
  slug: 'ownership-is-not-on-call',
  category: 'leadership',
  tags: ['Ownership', 'On-call'],
  title: { en: 'Ownership Is Not On-Call', ru: 'Оунершип — это не дежурство' },
  takeaway: { en: 'Owning a system means deciding what is allowed to page you.', ru: 'Владеть системой — значит решать, что имеет право вас будить.' },
  quote: { en: 'Delete alerts nobody acts on.', ru: 'Удаляйте алерты, на которые никто не реагирует.' },
  bullets: {
    en: ['Being on the rota is not the same as owning the system.', 'Owners decide what pages them.', 'Alerts nobody acts on get deleted.'],
    ru: ['Стоять в графике дежурств — не то же самое, что владеть системой.', 'Владелец сам решает, что его будит.', 'Алерты, на которые никто не реагирует, удаляются.'],
  },
  bodyRu: 'Оунершип — это не дежурство.\n\nВладеть системой — значит решать, что имеет право вас будить, и удалять алерты, на которые никто не реагирует.',
};

// The 9 brief-only posts the site launched with, frozen: the live posts.json changes with every bot
// PR (and its CI runs these tests on the changed data), so run() is tested against this fixture.
const STUBS = readJson('tests/fixtures/publora/site-posts.json') as BlogPost[];

// The site as most runs see it: post-1 already has its full text, so only new posts reach the model.
const SITE = STUBS.map((p) => (p.id === 'post-1' ? { ...p, body: { en: 'Full text.', ru: 'Полный текст.' } } : p));

type Call = { url: string; method: string; headers: Headers; body: any };
function harness(opts: { groups?: Group[]; publora?: 'ok' | '401' | '500'; drafts?: Record<string, unknown>; posts?: BlogPost[] } = {}) {
  const groups = opts.groups ?? GROUPS;
  const calls: Call[] = [];
  const logs: string[] = [];
  const writes: Record<string, string> = {};
  const drafts: Record<string, unknown> = opts.drafts ?? { 'waiting problem': DRAFT_NEW, 'Ownership is not on-call': DRAFT_PARTIAL };
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method: init.method ?? 'GET', headers, body });
    if (url.startsWith('https://api.publora.com/')) {
      if (opts.publora === '401') return new Response(JSON.stringify({ success: false, error: 'Invalid API key' }), { status: 401 });
      if (opts.publora === '500') return new Response('upstream down', { status: 500 });
      const u = new URL(url);
      if (u.pathname === '/api/v1/list-posts') {
        const status = u.searchParams.get('status');
        const platform = u.searchParams.get('platform');
        const page = Number(u.searchParams.get('page') ?? 1);
        const all = groups.filter((g) => (!status || g.status === status) && (!platform || g.posts.some((p) => p.platform === platform)));
        // Two per page, so the sync has to paginate.
        const slice = all.slice((page - 1) * 2, page * 2);
        const totalPages = Math.max(1, Math.ceil(all.length / 2));
        return Response.json({
          success: true,
          posts: slice.map(listItem),
          pagination: { page, limit: 2, totalItems: all.length, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
        });
      }
      const id = u.pathname.match(/^\/api\/v1\/get-post\/(.+)$/)?.[1];
      const g = groups.find((gr) => gr.postGroupId === id);
      if (!g) return new Response(JSON.stringify({ success: false, error: 'Post group not found' }), { status: 404 });
      return Response.json({ success: true, postGroupId: g.postGroupId, status: g.status, platforms: [], posts: g.posts, media: [] });
    }
    if (url.startsWith('https://openrouter.ai/')) {
      const user = String(body.messages.at(-1).content);
      const key = Object.keys(drafts).find((k) => user.includes(k));
      const content = key === undefined ? 'not json' : typeof drafts[key] === 'string' ? (drafts[key] as string) : JSON.stringify(drafts[key]);
      return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.00042 } });
    }
    return new Response('unexpected', { status: 599 });
  }) as unknown as typeof fetch;
  const env = {
    PUBLORA_API_KEY: 'sk_publora_test_secret',
    OPENROUTER_API_KEY: 'sk-or-test-secret',
    PUBLORA_SYNC_MODEL: '',
    PUBLORA_SINCE: '2026-10-13',
    GITHUB_OUTPUT: '/tmp/gh-output',
    PR_BODY_PATH: '.publora/pr-body.md',
  };
  const deps = {
    fetch: fetchImpl,
    readPosts: () => structuredClone(opts.posts ?? SITE),
    writeFile: (p: string, s: string) => void (writes[p] = (writes[p] ?? '') + s),
    log: (s: string) => void logs.push(s),
  };
  return { calls, logs, writes, env, deps, base: opts.posts ?? SITE };
}
const written = (h: ReturnType<typeof harness>) => postsAfter(h.base, h.writes);
const toModel = (h: ReturnType<typeof harness>) => h.calls.filter((c) => c.url.startsWith('https://openrouter.ai/'));

// --- the posts data ----------------------------------------------------------------------------

describe('the posts on the site (one file each: tests/posts-store.test.ts)', () => {
  test('every existing post passes the same entry check a generated one must pass', () => {
    for (const p of BLOG_POSTS) expect(checkEntry(p as BlogPost), p.id).toEqual([]);
  });

  test('a post with no LinkedIn url is a hand-written one and must carry its full text', () => {
    // One without a plain version: that one would also need its body (the depth dial's check).
    const own = BLOG_POSTS.find((p) => !p.url && p.body && !p.plain) as BlogPost;
    expect(own).toBeDefined();
    expect(checkEntry({ ...own, body: undefined })).toEqual(['url: none, so the post needs its full text in body']);
    expect(checkEntry({ ...own, url: 'https://example.com/post' })[0]).toMatch(/^url: not a LinkedIn post url/);
  });
});

// --- Publora parsing and de-dupe ---------------------------------------------------------------

describe('LinkedIn ids, urls and dates', () => {
  test('the numeric activity id comes out of vanity urls, feed urls and URNs alike', () => {
    expect(activityId(`https://www.linkedin.com/posts/rossev_engineeringmanagement-share-${ON_SITE_ID}-H9N0`)).toBe(ON_SITE_ID);
    expect(activityId(`https://www.linkedin.com/posts/rossev_the-new-ai-ugcPost-7517920896150536192-7TGN`)).toBe('7517920896150536192');
    expect(activityId(`urn:li:share:${NEW_ID}`)).toBe(NEW_ID);
    expect(activityId(`urn:li:ugcPost:${PARTIAL_ID}`)).toBe(PARTIAL_ID);
    expect(activityId(`https://www.linkedin.com/feed/update/urn:li:activity:${NEW_ID}/`)).toBe(NEW_ID);
    expect(activityId('https://www.linkedin.com/in/rossev')).toBeNull();
    expect(activityId('')).toBeNull();
  });

  test('the publication date is the snowflake timestamp, in UTC', () => {
    expect(publishedDate(NEW_ID)).toBe('2026-11-02');
    expect(publishedDate(ON_SITE_ID)).toBe('2026-10-13');
  });

  test('list-posts is parsed strictly: a response without a posts array or pagination throws', () => {
    const ok = parseListPosts({ success: true, posts: [listItem(GROUPS[0])], pagination: { page: 1, hasNextPage: false } });
    expect(ok.posts.map((p) => p.postGroupId)).toEqual(['g-new']);
    expect(ok.hasNextPage).toBe(false);
    expect(() => parseListPosts({ success: true })).toThrow();
    expect(() => parseListPosts({ success: false, error: 'x' })).toThrow();
    expect(() => parseListPosts(null)).toThrow();
  });

  test('only a published LinkedIn target counts; the url is the permalink, else the feed url of the URN', () => {
    const get = (g: Group) => ({ success: true, postGroupId: g.postGroupId, status: g.status, posts: g.posts });
    const [n] = linkedinTargets(get(GROUPS[0]));
    expect(n).toMatchObject({ activityId: NEW_ID, content: NEW_TEXT, url: `https://www.linkedin.com/feed/update/urn:li:share:${NEW_ID}/` });
    const [p] = linkedinTargets(get(GROUPS[3]));
    expect(p.url).toBe(`https://www.linkedin.com/posts/rossev_ownership-ugcPost-${PARTIAL_ID}-AbCd`);
    expect(linkedinTargets(get(GROUPS[4]))).toEqual([]);
  });

  test('the source text keeps the words a reader sees: mentions become names, hashtag-only lines go', () => {
    const s = cleanSource(NEW_TEXT);
    expect(s).toContain("Anna Ivanova's team");
    expect(s).not.toContain('urn:li');
    expect(s).not.toContain('#EngineeringManagement');
    expect(s.endsWith('Fix the queue before you hire.')).toBe(true);
  });
});

// --- the model's draft -------------------------------------------------------------------------

describe('the model draft is validated, never trusted', () => {
  const src = cleanSource(NEW_TEXT);
  test('a good draft passes', () => {
    expect(validateDraft(DRAFT_NEW, src)).toMatchObject({ ok: true });
  });

  test('missing fields, wrong category, wrong bullet count, or extra keys are rejected', () => {
    const bad = (patch: any) => validateDraft({ ...structuredClone(DRAFT_NEW), ...patch }, src).ok;
    expect(bad({ title: { en: 'x' } })).toBe(false);
    expect(bad({ category: 'marketing' })).toBe(false);
    expect(bad({ bullets: { en: DRAFT_NEW.bullets.en.slice(0, 2), ru: DRAFT_NEW.bullets.ru } })).toBe(false);
    expect(bad({ tags: [] })).toBe(false);
    expect(bad({ slug: 'Not A Slug!' })).toBe(false);
    expect(bad({ extra: 'field' })).toBe(false);
    expect(validateDraft('{"slug":', src).ok).toBe(false);
    expect(validateDraft(null, src).ok).toBe(false);
  });

  test('a number the post never said is a fabrication and rejects the draft', () => {
    const d = structuredClone(DRAFT_NEW);
    d.bullets.en[1] = 'Teams that fix the queue ship 45% faster.';
    const r = validateDraft(d, src);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain('45');
    const ru = structuredClone(DRAFT_NEW);
    ru.bodyRu += '\n\nЭто экономит 12 часов в неделю.';
    expect(validateDraft(ru, src).ok).toBe(false);
  });

  test('the Russian fields must be Russian and the English ones English', () => {
    const d = structuredClone(DRAFT_NEW);
    d.title.ru = d.title.en;
    expect(validateDraft(d, src).ok).toBe(false);
    const e = structuredClone(DRAFT_NEW);
    e.takeaway.en = e.takeaway.ru;
    expect(validateDraft(e, src).ok).toBe(false);
  });

  test('the Russian follows src/i18n/ru-style.ts: a banned stand-in or «ты» rejects the draft, IT anglicisms pass', () => {
    const d = structuredClone(DRAFT_NEW);
    d.bullets.ru[2] = 'Сократите очередь на ревью: пока ждёшь, PR уже влит в main.';
    const r = validateDraft(d, src);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain('ждёшь');
    expect(JSON.stringify(r)).toContain('влит');
    const ok = structuredClone(DRAFT_NEW);
    ok.bullets.ru[2] = 'Сократите очередь на ревью: фидбек по PR важнее, чем быстрый мерж.';
    expect(validateDraft(ok, src)).toMatchObject({ ok: true });
  });
});

describe('the Russian adaptation prompt follows src/i18n/ru-style.ts', () => {
  const p = systemPrompt();
  test('keeps IT terms as engineers say them and names the stand-ins it must not use', () => {
    for (const s of ['мерж', 'фидбек', 'гардрейл', 'влить', '«вы»', 'десятичная запятая']) expect(p).toContain(s);
  });
  test('a new category gets the site labels: ДЕЛИВЕРИ and ЛИДЕРСТВО', () => {
    expect(CATEGORY_LABELS.delivery.ru).toBe('ДЕЛИВЕРИ');
    expect(CATEGORY_LABELS.leadership.ru).toBe('ЛИДЕРСТВО');
  });
});

// --- the site entry ----------------------------------------------------------------------------

describe('the generated entry looks like the posts already on the site', () => {
  const existing = STUBS;
  const entry = buildEntry({
    draft: DRAFT_NEW as any,
    source: cleanSource(NEW_TEXT),
    url: `https://www.linkedin.com/feed/update/urn:li:share:${NEW_ID}/`,
    activityId: NEW_ID,
    existing,
  });

  test('passes the entry check every existing post passes', () => {
    expect(checkEntry(entry)).toEqual([]);
  });

  test('gets the next id, the snowflake date, the category label the site already uses, a palette color', () => {
    const max = Math.max(...existing.map((p) => Number(p.id.replace('post-', ''))));
    expect(entry.id).toBe(`post-${max + 1}`);
    expect(entry.published).toBe('2026-11-02');
    expect(entry.categoryLabel).toEqual(existing.find((p) => p.category === 'delivery')!.categoryLabel);
    expect(new Set(existing.map((p) => p.color))).toContain(entry.color);
    expect(entry.originalMinutes).toBeGreaterThanOrEqual(1);
  });

  test('the page carries the full text: the original in English, the adaptation in Russian', () => {
    expect(entry.body?.en).toBe(cleanSource(NEW_TEXT));
    expect(entry.body?.ru).toBe(DRAFT_NEW.bodyRu);
    expect(entry.brief.bullets.en).toEqual(DRAFT_NEW.bullets.en);
    expect(entry.brief.quote).toEqual(DRAFT_NEW.quote);
  });

  test('slugs never collide with a published one', () => {
    expect(uniqueSlug('fresh-slug', new Set(['a']))).toBe('fresh-slug');
    expect(uniqueSlug(existing[0].slug, new Set(existing.map((p) => p.slug)))).toBe(`${existing[0].slug}-2`);
    expect(uniqueSlug('x', new Set(['x', 'x-2']))).toBe('x-3');
    const clash = buildEntry({ draft: { ...DRAFT_NEW, slug: existing[0].slug } as any, source: cleanSource(NEW_TEXT), url: 'u', activityId: NEW_ID, existing });
    expect(clash.slug).toBe(`${existing[0].slug}-2`);
  });
});

// --- a run end to end --------------------------------------------------------------------------

describe('a sync run end to end, with Publora and OpenRouter mocked', () => {
  test('adds the two new LinkedIn posts, newest first, and skips what is on the site, old, or not on LinkedIn', async () => {
    const h = harness();
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    const posts = written(h)!;
    expect(posts.length).toBe(STUBS.length + 2);
    const added = posts.slice(0, 2);
    expect(added.map((p) => p.slug)).toEqual(['ownership-is-not-on-call', 'velocity-is-a-waiting-problem']);
    expect(posts.slice(2)).toEqual(SITE);
    for (const p of added) expect(checkEntry(p)).toEqual([]);
    expect(new Set(posts.map((p) => p.id)).size).toBe(posts.length);
    expect(new Set(posts.map((p) => p.slug)).size).toBe(posts.length);
    // Only the two new posts' files, pretty JSON, exactly what the file check expects.
    expect(Object.keys(h.writes).filter((p) => p.startsWith('src/data/posts/')).sort()).toEqual(added.map(postFile).sort());
    for (const p of added) expect(h.writes[postFile(p)]).toBe(postJson(p));
    expect(toModel(h).length).toBe(2);
  });

  test('asks Publora only for published LinkedIn posts, paginates, and sends the key only in its header', async () => {
    const h = harness();
    await run(h.env, h.deps);
    const lists = h.calls.filter((c) => c.url.includes('/api/v1/list-posts')).map((c) => new URL(c.url));
    expect(lists.length).toBeGreaterThan(2); // more than one page per status
    for (const u of lists) {
      expect(u.searchParams.get('platform')).toBe('linkedin');
      expect(['published', 'partially_published']).toContain(u.searchParams.get('status')!);
    }
    for (const c of h.calls.filter((c) => c.url.startsWith('https://api.publora.com/'))) {
      expect(c.headers.get('x-publora-key')).toBe('sk_publora_test_secret');
      expect(c.url).not.toContain('sk_publora_test_secret');
    }
    // Groups already on the site, or published before PUBLORA_SINCE, never reach the model.
    const asked = toModel(h).map((c) => String(c.body.messages.at(-1).content)).join('\n');
    expect(asked).not.toContain('applied systems thinking');
    expect(asked).not.toContain('old post from September');
  });

  test('the model call is bounded and schema-constrained, with no tools', async () => {
    const h = harness();
    await run(h.env, h.deps);
    for (const c of toModel(h)) {
      expect(c.headers.get('authorization')).toBe('Bearer sk-or-test-secret');
      expect(c.body.response_format?.type).toBe('json_schema');
      expect(c.body.response_format.json_schema.strict).toBe(true);
      expect(c.body.max_tokens).toBeGreaterThan(0);
      expect(c.body.max_tokens).toBeLessThanOrEqual(4000);
      expect(c.body.tools).toBeUndefined();
      // The post is data, fenced, not instructions.
      expect(String(c.body.messages[0].content)).toMatch(/untrusted|data, not instructions/i);
      expect(String(c.body.messages[0].content)).toMatch(/never (add|invent).*number/i);
    }
  });

  test('tells the workflow what happened: added count and a PR body with titles, links and cost, no AI attribution', async () => {
    const h = harness();
    await run(h.env, h.deps);
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=2$/m);
    const body = h.writes['.publora/pr-body.md'];
    expect(body).toContain('Ownership Is Not On-Call');
    expect(body).toContain('/writing/velocity-is-a-waiting-problem/');
    expect(body).toContain(`urn:li:share:${NEW_ID}`);
    expect(body).toMatch(/\$0\.0008/);
    // No attribution lines; naming the model that wrote the draft is a fact for the reviewer, not attribution.
    expect(body).not.toMatch(/co-authored-by|generated with|🤖/i);
  });

  test('nothing new: no model call, posts.json untouched, added=0, no PR body', async () => {
    const h = harness({ groups: [GROUPS[1], GROUPS[2], GROUPS[4]] });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('none');
    expect(toModel(h).length).toBe(0);
    expect(written(h)).toBeUndefined();
    expect(h.writes['.publora/pr-body.md']).toBeUndefined();
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=0$/m);
    expect(h.logs.join('\n')).toMatch(/0 new posts?/i);
  });

  test('an invalid or fabricating draft skips that post with a reason; the others still land', async () => {
    const lying = structuredClone(DRAFT_PARTIAL);
    lying.bullets.en[0] = 'Owners cut pages by 80%.';
    const h = harness({ drafts: { 'waiting problem': DRAFT_NEW, 'Ownership is not on-call': lying } });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    expect(written(h)!.length).toBe(STUBS.length + 1);
    expect(h.logs.join('\n')).toMatch(/skip.*80/i);
    expect(h.writes['.publora/pr-body.md']).toMatch(/skipped/i);

    const junk = harness({ drafts: { 'waiting problem': 'Sure! Here is the JSON: {', 'Ownership is not on-call': '{}' } });
    const none = await run(junk.env, junk.deps);
    expect(none.status).toBe('none');
    expect(written(junk)).toBeUndefined();
    expect(junk.writes['/tmp/gh-output']).toMatch(/^added=0$/m);
  });

  test('Publora refusing or down: fails soft with a clear log, writes nothing, never leaks a key', async () => {
    for (const mode of ['401', '500'] as const) {
      const h = harness({ publora: mode });
      const out = await run(h.env, h.deps);
      expect(out.status).toBe('error');
      expect(written(h)).toBeUndefined();
      const log = h.logs.join('\n');
      expect(log).toContain(mode);
      expect(log).not.toContain('sk_publora_test_secret');
      expect(log).not.toContain('sk-or-test-secret');
      expect(h.writes['/tmp/gh-output']).toMatch(/^added=0$/m);
    }
  });

  test('missing keys: says which one, calls nothing', async () => {
    const h = harness();
    const out = await run({ ...h.env, PUBLORA_API_KEY: '' }, h.deps);
    expect(out.status).toBe('error');
    expect(h.calls.length).toBe(0);
    expect(h.logs.join('\n')).toContain('PUBLORA_API_KEY');
  });

  test('no secret ever reaches the log', async () => {
    const h = harness();
    await run(h.env, h.deps);
    const log = h.logs.join('\n');
    expect(log).not.toContain('sk_publora_test_secret');
    expect(log).not.toContain('sk-or-test-secret');
  });
});

// --- the model --------------------------------------------------------------------------------------

describe('the model picked in the bake-off', () => {
  test('Haiku 5.5 first, GLM-5.3 Flash as the OpenRouter fallback; the call sends both', async () => {
    expect(DEFAULT_MODEL).toBe('anthropic/claude-haiku-5.5,z-ai/glm-5.3-flash');
    const h = harness();
    await run(h.env, h.deps);
    for (const c of toModel(h)) {
      expect(c.body.model).toBe('anthropic/claude-haiku-5.5');
      expect(c.body.models).toEqual(['anthropic/claude-haiku-5.5', 'z-ai/glm-5.3-flash']);
    }
  });

  test('the one-off bake-off is gone', () => {
    expect(existsSync('scripts/ci/publora-bakeoff.ts')).toBe(false);
    expect(existsSync('.github/workflows/publora-bakeoff.yml')).toBe(false);
  });

  test('README states the model chain and the measured cost per post', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('anthropic/claude-haiku-5.5,z-ai/glm-5.3-flash');
    expect(readme).toMatch(/\$0\.001 per post/);
    expect(readme).not.toContain('<!-- cost -->');
  });
});

// --- one OpenRouter client ---------------------------------------------------------------------

describe('one OpenRouter client, shared with the perf watchdog', () => {
  test('the watchdog and the sync both use scripts/ci/openrouter.ts; nobody else calls the endpoint', () => {
    for (const f of ['scripts/ci/watchdog.ts', 'scripts/ci/publora-sync.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(/from '\.\/openrouter'/);
      expect(src).not.toContain('openrouter.ai/api');
    }
  });

  test('passes a response format and a token cap through', async () => {
    let body: any;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({ choices: [{ message: { content: '{}' } }], usage: { cost: 0.0001 } });
    }) as unknown as typeof fetch;
    const rf = { type: 'json_schema', json_schema: { name: 'x', strict: true, schema: { type: 'object' } } };
    await callOpenRouter({ apiKey: 'k-123456', model: 'm', messages: [], fetchImpl, maxTokens: 3000, responseFormat: rf, title: 'rossev.dev publora sync' });
    expect(body.max_tokens).toBe(3000);
    expect(body.response_format).toEqual(rf);
  });
});

// --- the workflow ------------------------------------------------------------------------------

describe('.github/workflows/publora-sync.yml', () => {
  const path = '.github/workflows/publora-sync.yml';
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const wf = raw ? (Bun.YAML.parse(raw) as any) : {};
  const on = wf.on ?? wf[true as any] ?? {};
  const jobs = Object.values(wf.jobs ?? {}) as any[];
  const steps = jobs.flatMap((j) => j.steps ?? []) as any[];
  const runs = steps.map((s) => String(s.run ?? ''));

  test('runs daily on a schedule and by hand, nothing else', () => {
    expect(raw).not.toBe('');
    expect(Object.keys(on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    // Two daily slots: GitHub drops scheduled runs under load, and a run is idempotent.
    expect(on.schedule.length).toBe(2);
    for (const s of on.schedule) expect(s.cron).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    expect(new Set(on.schedule.map((s: any) => s.cron.split(' ')[1])).size).toBe(2);
  });

  test('minimal permissions: the GITHUB_TOKEN only reads; every write goes through the PAT in `publish`', () => {
    expect(wf.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' });
    for (const j of jobs) if (j.permissions) expect(j.permissions).toEqual(wf.permissions);
  });

  test('the API keys reach only the sync step, as env from secrets, never inlined in a script', () => {
    const secrets = [...raw.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    for (const s of secrets) expect(['PUBLORA_API_KEY', 'OPENROUTER_API_KEY', 'GITHUB_TOKEN', 'PUBLORA_SYNC_TOKEN']).toContain(s);
    for (const s of steps) if (s.run) expect(String(s.run)).not.toContain('secrets.');
    const withKeys = steps.filter((s) => JSON.stringify(s.env ?? {}).match(/PUBLORA_API_KEY|OPENROUTER_API_KEY/));
    expect(withKeys.length).toBe(1);
    expect(String(withKeys[0].run)).toContain('scripts/ci/publora-sync.ts');
    expect(withKeys[0].env.PUBLORA_API_KEY).toBe('${{ secrets.PUBLORA_API_KEY }}');
    expect(withKeys[0].env.OPENROUTER_API_KEY).toBe('${{ secrets.OPENROUTER_API_KEY }}');
  });

  test('every action is pinned to a full commit SHA', () => {
    const uses = steps.filter((s) => s.uses).map((s) => String(s.uses));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
  });

  test('sync, then tests and build, then ONE PR on a fixed branch, only when something was added', () => {
    const iSync = steps.findIndex((s) => String(s.run ?? '').includes('scripts/ci/publora-sync.ts'));
    const iTest = runs.findIndex((r, i) => i > iSync && /\bbun (run )?test\b/.test(r));
    const iPr = runs.findIndex((r) => /gh pr (create|edit)/.test(r));
    expect(iSync).toBeGreaterThanOrEqual(0);
    expect(iTest).toBeGreaterThan(iSync);
    expect(iPr).toBeGreaterThan(iTest);
    const id = steps[iSync].id;
    expect(id).toBeTruthy();
    const sync = wf.jobs.sync.steps as any[];
    for (const s of sync.slice(sync.findIndex((x) => x.id === id) + 1)) expect(String(s.if ?? '')).toContain(`steps.${id}.outputs.added`);
    // The PR is pushed from a second job on a fresh VM, only when the sync added something.
    expect(wf.jobs.publish.needs).toBe('sync');
    expect(String(wf.jobs.publish.if)).toContain('needs.sync.outputs.added');
    expect((wf.jobs.publish.steps as any[]).some((s) => /gh pr (create|edit)/.test(String(s.run ?? '')))).toBe(true);
    expect(raw).toContain('bot/publora-sync');
    expect(runs[iPr]).toMatch(/--body-file/);
    expect(raw).not.toMatch(/git push\b[^\n]*\bmain\b/);
    expect(raw).not.toMatch(/--force\b(?!-with-lease)/);
  });

  // `sync` runs package code, so its outputs are untrusted: a forged sha could point at a fork's
  // commit (reachable by sha through this repo) and turn the bot PR into an attacker's whole tree.
  test('publish only builds on a sha that is a full commit id already on main', () => {
    const run = String((wf.jobs.publish.steps as any[]).find((s) => /gh pr (create|edit)/.test(String(s.run ?? ''))).run);
    expect(run).toMatch(/\^\[0-9a-f\]\{40\}\$/);
    expect(run).toMatch(/git merge-base --is-ancestor "\$SHA" origin\/main/);
    expect(String(wf.jobs.publish.steps.find((s: any) => s.run?.includes('gh pr')).env.SHA)).toBe('${{ needs.sync.outputs.sha }}');
  });

  // grep -q quits on the first match; git log then dies of SIGPIPE and pipefail flips the test,
  // so a human edit would be force-pushed over. Capture the list first instead.
  test('the human-commit guard does not pipe git log into grep -q, and says so as a warning', () => {
    const run = String((wf.jobs.publish.steps as any[]).find((s) => /gh pr (create|edit)/.test(String(s.run ?? ''))).run);
    expect(run).not.toMatch(/git log[^\n|]*\|\s*grep -q/);
    expect(run).toMatch(/::warning::[^\n]*someone other than the bot/);
  });

  test('no AI attribution in commits or PRs; the bot is the author', () => {
    expect(raw).not.toMatch(/co-authored-by|generated with|🤖/i);
    expect(raw).toContain('github-actions[bot]');
  });

  test('bounded and never two at once', () => {
    for (const j of jobs) expect(j['timeout-minutes']).toBeLessThanOrEqual(20);
    expect(wf.concurrency?.group).toBeTruthy();
    expect(wf.concurrency?.['cancel-in-progress']).toBe(false);
  });
});

describe('README', () => {
  test('documents the Publora sync: how it works, the secret, a manual run, cost per post', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toMatch(/^## Publora sync$/m);
    expect(readme).toContain('PUBLORA_API_KEY');
    expect(readme).toContain('gh secret set PUBLORA_API_KEY');
    expect(readme).toContain('gh workflow run publora-sync.yml');
    expect(readme).toContain('PUBLORA_SYNC_MODEL');
    expect(readme).toMatch(/per post/i);
  });
});

// --- holes the judge found -----------------------------------------------------------------------

describe('the validator has no easy holes', () => {
  const src = cleanSource(NEW_TEXT);

  test('Russian means mostly Russian, and the adaptation covers the whole post', () => {
    const oneWord = structuredClone(DRAFT_NEW);
    oneWord.bodyRu = src + ' и';
    expect(validateDraft(oneWord, src).ok).toBe(false);
    const firstParagraphOnly = structuredClone(DRAFT_NEW);
    firstParagraphOnly.bodyRu = 'У большинства команд нет проблемы со скоростью.';
    expect(validateDraft(firstParagraphOnly, src).ok).toBe(false);
    const mixedTitle = structuredClone(DRAFT_NEW);
    mixedTitle.title.ru = 'Your Team Has a Waiting Problem, не Velocity';
    expect(validateDraft(mixedTitle, src).ok).toBe(false);
  });

  test('a number cannot be scaled up, shortened, or glued to a letter', () => {
    const with_ = (source: string, bullet: string) => {
      const d = structuredClone(DRAFT_NEW);
      d.bullets.en[1] = bullet;
      return validateDraft(d, cleanSource(`${NEW_TEXT}\n\n${source}`)).ok;
    };
    expect(with_('We closed 1 000 tickets.', 'The team closed 1 000 000 tickets last year.')).toBe(false);
    expect(with_('It took 3.5 hours.', 'Each review took about 5 hours on average.')).toBe(false);
    expect(with_('Nothing about quarters here.', 'Plan the Q4 roadmap around the review queue.')).toBe(false);
    expect(with_('We closed 1 000 tickets.', 'The team closed 1000 tickets in a quarter.')).toBe(true);
    expect(with_('It took 3.5 hours.', 'Each review took 3.5 hours on average here.')).toBe(true);
    expect(with_('We run K8s and B2B sales.', 'Even K8s teams in B2B have the same queue.')).toBe(true);
  });
});

describe('one bad post never blocks the others', () => {
  test('a get-post failure for one group skips that group; the rest still land', async () => {
    const ghost = { postGroupId: 'g-deleted', status: 'published', posts: [li(`urn:li:share:${NEW_ID}9`, 'published', 'gone')] } as Group;
    const h = harness({ groups: [...GROUPS, ghost] });
    const real = h.deps.fetch;
    h.deps.fetch = (async (url: string, init?: RequestInit) =>
      url.includes('/get-post/g-deleted') ? new Response(JSON.stringify({ success: false, error: 'Post group not found' }), { status: 404 }) : real(url, init)) as typeof fetch;
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    expect(written(h)!.length).toBe(STUBS.length + 2);
    expect(h.logs.join('\n')).toMatch(/g-deleted.*404/);
  });

  test('a published LinkedIn target whose id cannot be read is counted in the log, not silently dropped', async () => {
    const odd = { postGroupId: 'g-odd', status: 'published', posts: [li('urn:li:something:abc', 'published', 'odd')] } as Group;
    const h = harness({ groups: [GROUPS[1], odd] });
    await run(h.env, h.deps);
    expect(h.logs.join('\n')).toMatch(/1 .*without a LinkedIn id/i);
  });
});

describe('a post Gleb rejected stays rejected', () => {
  test('ids in src/data/publora-ignore.json are never imported, and the PR body says how to add one', async () => {
    expect(readJson('src/data/publora-ignore.json')).toEqual([]);
    const h = harness();
    (h.deps as any).readIgnored = () => [NEW_ID];
    await run(h.env, h.deps);
    expect(written(h)!.slice(0, 1).map((p) => p.slug)).toEqual(['ownership-is-not-on-call']);
    expect(written(h)!.length).toBe(STUBS.length + 1);
    expect(toModel(h).length).toBe(1);
    expect(h.writes['.publora/pr-body.md']).toContain('publora-ignore.json');
    expect(h.writes['.publora/pr-body.md']).toContain(PARTIAL_ID);
  });
});

describe('nothing is half-written', () => {
  test('if the PR body cannot be written, posts.json is not touched either', async () => {
    const h = harness();
    const write = h.deps.writeFile;
    h.deps.writeFile = (p: string, s: string) => {
      if (p === '.publora/pr-body.md') throw new Error('disk full');
      write(p, s);
    };
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('error');
    expect(written(h)).toBeUndefined();
  });
});

// --- full text for the posts already on the site ---------------------------------------------------

// A full draft for a post already on the site: the stub's hand-written brief is regenerated from the real text.
const BODY_RU = 'Инженерный менеджмент — это прикладное системное мышление, и команду стоит отлаживать как распределённую систему.';
const stubDraft = (bodyRu = BODY_RU, slug = 'systems-thinking-for-managers') => ({
  slug,
  category: 'leadership',
  tags: ['Systems Thinking', 'Management'],
  title: { en: 'Management Is Systems Thinking Applied', ru: 'Менеджмент — это прикладное системное мышление' },
  takeaway: { en: 'Debug a team the way you would debug a distributed system.', ru: 'Отлаживайте команду так же, как распределённую систему.' },
  quote: { en: 'Engineering management is applied systems thinking.', ru: 'Инженерный менеджмент — это системное мышление.' },
  bullets: {
    en: ['Treat the team as a system with feedback loops.', 'Look at the topology before blaming people.', 'Fix the loops, not the individuals.'],
    ru: ['Смотрите на команду как на систему с обратными связями.', 'Сначала топология процессов, потом люди.', 'Чините контуры, а не отдельных людей.'],
  },
  bodyRu,
});

describe('the stubs already on the site get their full text and a brief regenerated from it', () => {
  test('a site post without a body gets body.en = the original, a new brief and body.ru from the model; id, slug, url, date and color stay', async () => {
    const h = harness({ posts: STUBS, drafts: { 'waiting problem': DRAFT_NEW, 'Ownership is not on-call': DRAFT_PARTIAL, 'applied systems thinking': stubDraft() } });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    const posts = written(h)!;
    expect(posts.length).toBe(STUBS.length + 2);
    const p1 = posts.find((p) => p.id === 'post-1')!;
    const before = STUBS.find((p) => p.id === 'post-1')! as BlogPost;
    const d = stubDraft();
    expect(p1.body).toEqual({ en: 'Engineering management is applied systems thinking.', ru: BODY_RU });
    expect(p1.title).toEqual(d.title);
    expect(p1.takeaway).toEqual(d.takeaway);
    expect(p1.tags).toEqual(d.tags);
    expect(p1.brief).toEqual({ quote: d.quote, bullets: d.bullets });
    expect(p1.category).toBe('leadership');
    expect(p1.categoryLabel).toEqual(before.categoryLabel);
    // The canonical url and everything that identifies the post stay; the model's slug is ignored.
    for (const k of ['id', 'slug', 'published', 'url', 'color', 'originalMinutes'] as const) expect(p1[k]).toEqual(before[k]);
    expect(Object.keys(p1)).toEqual(Object.keys(posts[0]));
    expect(checkEntry(p1)).toEqual([]);
    // The other stubs are not in this Publora fixture, so they stay as they are.
    for (const p of posts.filter((p) => p.id !== 'post-1' && STUBS.some((b) => b.id === p.id))) expect(p).toEqual(STUBS.find((b) => b.id === p.id) as BlogPost);
    // Same prompt and schema as a new post.
    const stubCall = toModel(h).find((c) => String(c.body.messages.at(-1).content).includes('applied systems thinking'))!;
    expect(stubCall.body.response_format.json_schema.schema.required).toContain('bullets');
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=3$/m);
    const body = h.writes['.publora/pr-body.md'];
    expect(body).toMatch(/full text/i);
    expect(body).toMatch(/brief.*regenerated/i);
    // The PR shows what the old title was, so a reviewer sees the change.
    expect(body).toContain(before.title.en);
    expect(body).toContain(d.title.en);
  });

  test('only full text for old posts, nothing new: still one PR', async () => {
    const h = harness({ groups: [GROUPS[1]], posts: STUBS, drafts: { 'applied systems thinking': stubDraft() } });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    expect(written(h)!.length).toBe(STUBS.length);
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=1$/m);
    expect(h.writes['/tmp/gh-output']).toMatch(/^title=.*full text/im);
  });

  test('the draft is validated like any other: Russian, no new numbers, not a fragment', async () => {
    for (const draft of [stubDraft('Engineering management is applied systems thinking.'), stubDraft('Менеджмент — это на 40% системное мышление и распределённые системы.'), stubDraft('Коротко.'), { bodyRu: BODY_RU }]) {
      const h = harness({ groups: [GROUPS[1]], posts: STUBS, drafts: { 'applied systems thinking': draft } });
      const out = await run(h.env, h.deps);
      expect(out.status, JSON.stringify(draft).slice(0, 60)).toBe('none');
      expect(written(h)).toBeUndefined();
      expect(h.logs.join('\n')).toMatch(/skip/i);
    }
  });

  test('a post that already has a body is never sent to the model again', async () => {
    const h = harness({ groups: [GROUPS[1]] });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('none');
    expect(toModel(h).length).toBe(0);
  });
});


// --- posts that never went through Publora --------------------------------------------------------

describe('src/data/linkedin-backfill.json fills in what Publora never published', () => {
  const BACKFILL = 'src/data/linkedin-backfill.json';
  const entry = (id: string, text: string, slug = 'x') => ({ activityId: id, url: `https://www.linkedin.com/posts/rossev_${slug}-share-${id}-AbCd`, text });

  test('the file holds only id, LinkedIn url and text: one entry per post, ids matching the urls, no scraper leftovers', () => {
    const b = readJson(BACKFILL) as { activityId: string; url: string; text: string }[];
    expect(b.length).toBeGreaterThan(0);
    for (const e of b) {
      expect(Object.keys(e).sort()).toEqual(['activityId', 'text', 'url']);
      expect(activityId(e.url)).toBe(e.activityId);
      expect(e.url).toMatch(/^https:\/\/www\.linkedin\.com\/posts\/rossev_/);
      expect(e.text.length).toBeGreaterThan(100);
      expect(e.text).not.toMatch(/…\s*more\s*$/);
      expect(e.text).not.toContain('media.licdn.com');
    }
    expect(new Set(b.map((e) => e.activityId)).size).toBe(b.length);
    expect(b.map((e) => e.activityId)).toEqual([...b.map((e) => e.activityId)].sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1)));
    expect(readFileSync(BACKFILL, 'utf8')).toBe(JSON.stringify(b, null, 2) + '\n');
  });

  test('a backfill post missing from Publora and from the site becomes a new entry with its vanity url', async () => {
    const h = harness({ groups: [] });
    (h.deps as any).readBackfill = () => [entry(NEW_ID, NEW_TEXT, 'velocity')];
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    const p = written(h)![0];
    expect(p.slug).toBe('velocity-is-a-waiting-problem');
    expect(p.url).toBe(`https://www.linkedin.com/posts/rossev_velocity-share-${NEW_ID}-AbCd`);
    expect(p.published).toBe('2026-11-02');
    expect(p.body?.en).toBe(cleanSource(NEW_TEXT));
  });

  test('a backfill post already on the site without its text gives it the full text', async () => {
    const h = harness({ groups: [], posts: STUBS, drafts: { 'applied systems thinking': stubDraft() } });
    (h.deps as any).readBackfill = () => [entry(ON_SITE_ID, 'Engineering management is applied systems thinking.')];
    await run(h.env, h.deps);
    expect(written(h)!.find((p) => p.id === 'post-1')!.body?.en).toBe('Engineering management is applied systems thinking.');
  });

  test("Publora's copy wins over the backfill for the same post; PUBLORA_SINCE and the ignore list apply to both", async () => {
    const h = harness();
    (h.deps as any).readBackfill = () => [entry(NEW_ID, 'A stale scraped copy of the waiting problem post.'), entry(OLD_ID, 'Old one, before the cutoff.'), entry('7523353283788812399', 'Ignored one, never to be imported.')];
    (h.deps as any).readIgnored = () => ['7523353283788812399'];
    await run(h.env, h.deps);
    const asked = toModel(h).map((c) => String(c.body.messages.at(-1).content)).join('\n');
    expect(asked).not.toContain('stale scraped copy');
    expect(asked).not.toContain('before the cutoff');
    expect(asked).not.toContain('never to be imported');
    expect(written(h)!.find((p) => p.slug === 'velocity-is-a-waiting-problem')!.body?.en).toBe(cleanSource(NEW_TEXT));
  });

  test('a broken backfill file is logged and skipped; Publora posts still land', async () => {
    for (const bad of [() => ({}) as any, () => 'x' as any, () => [null, 42, { activityId: NEW_ID }] as any, () => { throw new SyntaxError('Unexpected token'); }]) {
      const h = harness();
      (h.deps as any).readBackfill = bad;
      const out = await run(h.env, h.deps);
      expect(out.status).toBe('added');
      expect(written(h)!.length).toBe(STUBS.length + 2);
    }
  });

  test('a backfill url that is not a LinkedIn url never reaches the model', async () => {
    const h = harness({ groups: [] });
    (h.deps as any).readBackfill = () => [{ activityId: NEW_ID, url: `https://evil.example/share-${NEW_ID}`, text: NEW_TEXT }];
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('none');
    expect(toModel(h).length).toBe(0);
  });


});

// --- the whole backfill in one run -----------------------------------------------------------------

describe('a run is bounded by time, not by a post count, so the whole backfill lands in one PR', () => {
  const entry = (id: string, text: string) => ({ activityId: id, url: `https://www.linkedin.com/posts/rossev_x-share-${id}-AbCd`, text });
  const backfillHarness = (n: number, minutesPerCall: number) => {
    const ids = Array.from({ length: n }, (_, i) => (BigInt(NEW_ID) + BigInt(i) * 1000n).toString());
    // Distinct titles and takeaways: the sync skips a draft that repeats one already on the site.
    const drafts = Object.fromEntries(
      ids.map((_, i) => [
        `Backfill post ${i} `,
        { ...DRAFT_NEW, slug: `backfill-post-${i}`, title: { ...DRAFT_NEW.title, en: `${DRAFT_NEW.title.en}, note ${i}` }, takeaway: { ...DRAFT_NEW.takeaway, en: `${DRAFT_NEW.takeaway.en} Note ${i}.` } },
      ]),
    );
    const h = harness({ groups: [], drafts });
    let now = 0;
    const real = h.deps.fetch;
    h.deps.fetch = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://openrouter.ai/')) now += minutesPerCall * 60_000;
      return real(url, init);
    }) as typeof fetch;
    (h.deps as any).now = () => now;
    (h.deps as any).readBackfill = () => ids.map((id, i) => entry(id, `${NEW_TEXT}\n\nBackfill post ${i} closing line.`));
    return h;
  };

  test('a quick model gets through 43 posts in one run', async () => {
    const h = backfillHarness(43, 0.15);
    await run(h.env, h.deps);
    expect(toModel(h).length).toBe(43);
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=43$/m);
    expect(h.writes['.publora/pr-body.md']).not.toMatch(/more post\(s\)/);
  });

  test('a slow model: no call starts after the time budget; newest first; the PR says how many wait', async () => {
    expect(RUN_BUDGET_MS).toBeLessThanOrEqual(13 * 60_000); // + tests and build inside the job's 20 minutes
    const h = backfillHarness(10, 2);
    await run(h.env, h.deps);
    const calls = Math.ceil(RUN_BUDGET_MS / (2 * 60_000));
    expect(toModel(h).length).toBe(calls);
    expect(written(h)![0].slug).toBe('backfill-post-9');
    expect(h.writes['.publora/pr-body.md']).toMatch(new RegExp(`${10 - calls} more post\\(s\\).*after this PR is merged`));
  });

  test('full-text fills share the same budget, after the new posts', async () => {
    const h = harness({ groups: [GROUPS[1]], posts: STUBS, drafts: { 'waiting problem': DRAFT_NEW, 'applied systems thinking': stubDraft() } });
    let now = 0;
    (h.deps as any).now = () => now;
    const real = h.deps.fetch;
    h.deps.fetch = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://openrouter.ai/')) now += RUN_BUDGET_MS; // the first call uses it all
      return real(url, init);
    }) as typeof fetch;
    (h.deps as any).readBackfill = () => [entry(NEW_ID, NEW_TEXT)];
    await run(h.env, h.deps);
    expect(toModel(h).length).toBe(1);
    expect(written(h)![0].slug).toBe('velocity-is-a-waiting-problem');
    expect(written(h)!.find((p) => p.id === 'post-1')!.body).toBeUndefined();
  });
});

describe('the backfill covers every own post Gleb has, from August 2025', () => {
  const b = readJson('src/data/linkedin-backfill.json') as { activityId: string; text: string }[];

  test('43 posts, the oldest on or after PUBLORA_SINCE, so none is filtered out by date', () => {
    expect(b.length).toBe(43);
    const oldest = publishedDate(b[0].activityId);
    expect(oldest).toBe('2025-08-19');
    expect(DEFAULT_SINCE <= oldest).toBe(true);
  });

  test('no job shares or bare reshares', () => {
    for (const e of b) expect(e.text).not.toMatch(/^(Guys, that’s a great opportunity|Another good opportunity|We're hiring|Exciting news! I am officially open)/);
  });
});

describe('fancy Unicode letters become plain text', () => {
  test('mathematical bold and italic letters are mapped to plain ones; other symbols stay', () => {
    expect(cleanSource('𝗔𝗜 𝘄𝗼𝗻’𝘁 𝗿𝗲𝗽𝗹𝗮𝗰𝗲 𝗱𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿𝘀. 𝙘𝙪𝙧𝙞𝙤𝙪𝙨')).toBe('AI won’t replace developers. curious');
    expect(cleanSource('Harness² loop… «ёлочки» — 🚀')).toBe('Harness² loop… «ёлочки» — 🚀');
  });
});

// --- one bad entry never blocks the PR ---------------------------------------------------------------

describe('what the page tests demand is enforced per entry, so one bad draft is skipped instead of failing the job', () => {
  const src = cleanSource(NEW_TEXT);

  test('a takeaway of 40 characters or fewer is rejected (it is the meta description, which must be longer)', () => {
    const d = structuredClone(DRAFT_NEW);
    d.takeaway.en = 'Fix the queue before you hire anyone.';
    expect(d.takeaway.en.length).toBeLessThanOrEqual(40);
    expect(validateDraft(d, src).ok).toBe(false);
  });

  test('a draft whose title or takeaway is already on the site is skipped with a reason', async () => {
    for (const patch of [{ title: { en: STUBS[2].title.en, ru: DRAFT_NEW.title.ru } }, { takeaway: { en: STUBS[3].takeaway.en, ru: DRAFT_NEW.takeaway.ru } }]) {
      const h = harness({ groups: [GROUPS[0]], drafts: { 'waiting problem': { ...DRAFT_NEW, ...patch } } });
      const out = await run(h.env, h.deps);
      expect(out.status).toBe('none');
      expect(h.logs.join('\n')).toMatch(/skip.*(same title|same takeaway)/i);
    }
  });

  test('the time budget counts from the start of the run, Publora calls included', async () => {
    const h = harness();
    let now = 0;
    (h.deps as any).now = () => now;
    const real = h.deps.fetch;
    h.deps.fetch = (async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://api.publora.com/')) now += RUN_BUDGET_MS;
      return real(url, init);
    }) as typeof fetch;
    await run(h.env, h.deps);
    expect(toModel(h).length).toBe(0);
  });
});

describe('the bot does not churn an open PR under review', () => {
  const raw = readFileSync('.github/workflows/publora-sync.yml', 'utf8');
  const wf = Bun.YAML.parse(raw) as any;
  const steps = (Object.values(wf.jobs) as any[]).flatMap((j) => j.steps);

  test('a step before the sync looks for an open bot PR, and the sync runs only when there is none', () => {
    const iSync = steps.findIndex((s: any) => String(s.run ?? '').includes('scripts/ci/publora-sync.ts'));
    const iCheck = steps.findIndex((s: any) => /gh pr list\b[\s\S]*--head bot\/publora-sync[\s\S]*--state open/.test(String(s.run ?? '')));
    expect(iCheck).toBeGreaterThanOrEqual(0);
    expect(iCheck).toBeLessThan(iSync);
    expect(String(steps[iSync].if ?? '')).toContain(`steps.${steps[iCheck].id}.outputs.`);
    // The check needs only a read token, never the API keys.
    expect(JSON.stringify(steps[iCheck].env ?? {})).not.toMatch(/PUBLORA_API_KEY|OPENROUTER_API_KEY/);
  });
});

describe('a LinkedIn copy of a post first published here links to it instead of adding a second entry', () => {
  const COPY_ID = '7524395148902412345'; // 2026-11-06, two days after the site post
  const OWN: BlogPost = {
    ...(structuredClone(SITE[1]) as BlogPost),
    id: 'post-10',
    slug: 'self-healing-monogram',
    published: '2026-11-04',
    url: undefined,
    title: { en: 'My Logo Heals Itself. Then I Erased It Into a Stick.', ru: 'Мой логотип заживает сам. А потом я стёр его в палку.' },
    takeaway: { en: 'A local model cannot recover information that is not there anymore.', ru: 'Локальная модель не восстановит информацию, которой больше нет.' },
    body: { en: 'The full text, first published here.', ru: 'Полный текст, впервые опубликованный здесь.' },
  };
  const COPY_TEXT = 'My logo heals itself. Then I erased it into a stick.\n\nFull story: https://rossev.dev/writing/self-healing-monogram/';
  const copyGroup: Group = { postGroupId: 'g-copy', status: 'published', posts: [li(`urn:li:share:${COPY_ID}`, 'published', COPY_TEXT)] };

  test('the post gets the url and keeps its own date, nothing else changes, and no model is called', async () => {
    const h = harness({ groups: [copyGroup], posts: [OWN, ...SITE] });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    expect(toModel(h).length).toBe(0);
    const posts = written(h)!;
    expect(posts.length).toBe(SITE.length + 1);
    expect(posts[0]).toEqual({ ...OWN, url: `https://www.linkedin.com/feed/update/urn:li:share:${COPY_ID}/` });
    expect(checkEntry(posts[0])).toEqual([]);
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=1$/m);
    expect(h.writes['/tmp/gh-output']).toMatch(/^title=Add LinkedIn links for 1 post from Publora$/m);
    expect(h.writes['.publora/pr-body.md']).toMatch(/LinkedIn copies of posts first published here \(1\)/);
  });

  test('the next run sees it as on the site: nothing to do', async () => {
    const h = harness({ groups: [copyGroup], posts: [{ ...OWN, url: `https://www.linkedin.com/feed/update/urn:li:share:${COPY_ID}/` }, ...SITE] });
    expect((await run(h.env, h.deps)).status).toBe('none');
  });

  test('a /ru/ link counts too; a link to a post that is already on LinkedIn does not', () => {
    expect(sitePostLinkedFrom('Read it: rossev.dev/ru/writing/self-healing-monogram/', [OWN])).toBe(0);
    expect(sitePostLinkedFrom('Read it: rossev.dev/writing/self-healing-monogram/', [{ ...OWN, url: 'https://www.linkedin.com/feed/update/urn:li:share:1/' }])).toBe(-1);
    expect(sitePostLinkedFrom('No link here.', [OWN])).toBe(-1);
  });

  test('the date check lets a post first published here predate its LinkedIn copy, never follow it', () => {
    const url = `https://www.linkedin.com/feed/update/urn:li:share:${COPY_ID}/`;
    expect(checkEntry({ ...OWN, url })).toEqual([]);
    expect(checkEntry({ ...OWN, url, published: '2026-11-07' })[0]).toMatch(/^published: 2026-11-07 but the LinkedIn id says 2026-11-06/);
    // Without its full text, the LinkedIn post is the original, so the dates must match.
    expect(checkEntry({ ...OWN, url, body: undefined })[0]).toMatch(/^published: 2026-11-04 but the LinkedIn id says 2026-11-06/);
  });
});
