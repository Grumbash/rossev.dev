// A LinkedIn post published through Publora shows up on rossev.dev without Gleb touching the
// repo: a daily GitHub Action (.github/workflows/publora-sync.yml) runs
// scripts/ci/publora-sync.ts, which lists published LinkedIn posts in Publora, skips the ones
// already on the site (matched by the numeric LinkedIn activity id, since the site keeps vanity
// URLs), asks a cheap OpenRouter model for the site entry (EN brief + RU adaptation of the full
// text) under a strict JSON schema, rejects anything invalid or with numbers the post never
// said, and writes the entries to src/data/posts.json. The workflow opens or updates ONE PR;
// nothing new means no commit and no PR. Publora and OpenRouter are mocked here.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { BLOG_POSTS, type BlogPost } from '../src/data/profile';
import {
  activityId,
  buildEntry,
  checkEntry,
  cleanSource,
  linkedinTargets,
  parseListPosts,
  publishedDate,
  run,
  uniqueSlug,
  validateDraft,
} from '../scripts/ci/publora-sync';
import { callOpenRouter } from '../scripts/ci/openrouter';

const POSTS_JSON = 'src/data/posts.json';
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

// The site as most runs see it: post-1 already has its full text, so only new posts reach the model.
const SITE = (BLOG_POSTS as BlogPost[]).map((p) => (p.id === 'post-1' ? { ...p, body: { en: 'Full text.', ru: 'Полный текст.' } } : p));

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
  return { calls, logs, writes, env, deps };
}
const written = (h: ReturnType<typeof harness>): BlogPost[] | undefined => (h.writes[POSTS_JSON] ? JSON.parse(h.writes[POSTS_JSON]) : undefined);
const toModel = (h: ReturnType<typeof harness>) => h.calls.filter((c) => c.url.startsWith('https://openrouter.ai/'));

// --- the posts data ----------------------------------------------------------------------------

describe('posts live in src/data/posts.json so a script can append safely', () => {
  test('profile.ts exports exactly the posts in posts.json, typed, nothing lost in the move', () => {
    expect(existsSync(POSTS_JSON)).toBe(true);
    const json = readJson(POSTS_JSON);
    expect(BLOG_POSTS).toEqual(json);
    expect(BLOG_POSTS.slice(-9).map((p) => p.id).sort()).toEqual(['post-1', 'post-2', 'post-3', 'post-4', 'post-5', 'post-6', 'post-7', 'post-8', 'post-9'].sort());
    expect(readFileSync('src/data/profile.ts', 'utf8')).not.toMatch(/export const BLOG_POSTS: BlogPost\[\] = \[\s*\{/);
  });

  test('posts.json is stable, pretty JSON with a trailing newline (machine edits make small diffs)', () => {
    const raw = readFileSync(POSTS_JSON, 'utf8');
    expect(raw).toBe(JSON.stringify(JSON.parse(raw), null, 2) + '\n');
  });

  test('every existing post passes the same entry check a generated one must pass', () => {
    for (const p of BLOG_POSTS) expect(checkEntry(p as BlogPost), p.id).toEqual([]);
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
});

// --- the site entry ----------------------------------------------------------------------------

describe('the generated entry looks like the posts already on the site', () => {
  const existing = BLOG_POSTS as BlogPost[];
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
    expect(posts.length).toBe(BLOG_POSTS.length + 2);
    const added = posts.slice(0, 2);
    expect(added.map((p) => p.slug)).toEqual(['ownership-is-not-on-call', 'velocity-is-a-waiting-problem']);
    expect(posts.slice(2)).toEqual(SITE);
    for (const p of added) expect(checkEntry(p)).toEqual([]);
    expect(new Set(posts.map((p) => p.id)).size).toBe(posts.length);
    expect(new Set(posts.map((p) => p.slug)).size).toBe(posts.length);
    // Pretty JSON, exactly what the file check above expects.
    expect(h.writes[POSTS_JSON]).toBe(JSON.stringify(posts, null, 2) + '\n');
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
    expect(body).not.toMatch(/co-authored-by|generated with|claude|🤖/i);
  });

  test('nothing new: no model call, posts.json untouched, added=0, no PR body', async () => {
    const h = harness({ groups: [GROUPS[1], GROUPS[2], GROUPS[4]] });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('none');
    expect(toModel(h).length).toBe(0);
    expect(h.writes[POSTS_JSON]).toBeUndefined();
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
    expect(written(h)!.length).toBe(BLOG_POSTS.length + 1);
    expect(h.logs.join('\n')).toMatch(/skip.*80/i);
    expect(h.writes['.publora/pr-body.md']).toMatch(/skipped/i);

    const junk = harness({ drafts: { 'waiting problem': 'Sure! Here is the JSON: {', 'Ownership is not on-call': '{}' } });
    const none = await run(junk.env, junk.deps);
    expect(none.status).toBe('none');
    expect(junk.writes[POSTS_JSON]).toBeUndefined();
    expect(junk.writes['/tmp/gh-output']).toMatch(/^added=0$/m);
  });

  test('Publora refusing or down: fails soft with a clear log, writes nothing, never leaks a key', async () => {
    for (const mode of ['401', '500'] as const) {
      const h = harness({ publora: mode });
      const out = await run(h.env, h.deps);
      expect(out.status).toBe('error');
      expect(h.writes[POSTS_JSON]).toBeUndefined();
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
    expect(on.schedule.length).toBe(1);
    expect(on.schedule[0].cron).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
  });

  test('minimal permissions: write contents and pull requests, nothing more', () => {
    expect(wf.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
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
    const iTest = runs.findIndex((r, i) => i > iSync && /\bbun test\b/.test(r));
    const iPr = runs.findIndex((r) => /gh pr (create|edit)/.test(r));
    expect(iSync).toBeGreaterThanOrEqual(0);
    expect(iTest).toBeGreaterThan(iSync);
    expect(iPr).toBeGreaterThan(iTest);
    const id = steps[iSync].id;
    expect(id).toBeTruthy();
    for (const s of steps.slice(iSync + 1)) expect(String(s.if ?? '')).toContain(`steps.${id}.outputs.added`);
    expect(raw).toContain('bot/publora-sync');
    expect(runs[iPr]).toMatch(/--body-file/);
    expect(raw).not.toMatch(/git push\b[^\n]*\bmain\b/);
    expect(raw).not.toMatch(/--force\b(?!-with-lease)/);
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
    expect(written(h)!.length).toBe(BLOG_POSTS.length + 2);
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
    expect(written(h)!.length).toBe(BLOG_POSTS.length + 1);
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
    expect(h.writes[POSTS_JSON]).toBeUndefined();
  });
});

// --- full text for the posts already on the site ---------------------------------------------------

describe('the stubs already on the site get their full text through the same importer', () => {
  const BODY_RU = 'Инженерный менеджмент — это прикладное системное мышление, и команду стоит отлаживать как распределённую систему.';

  test('a site post without a body, found in Publora, gets body.en = the original and body.ru = an adaptation; its brief stays', async () => {
    const h = harness({ posts: BLOG_POSTS as BlogPost[], drafts: { 'waiting problem': DRAFT_NEW, 'Ownership is not on-call': DRAFT_PARTIAL, 'applied systems thinking': { bodyRu: BODY_RU } } });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    const posts = written(h)!;
    expect(posts.length).toBe(BLOG_POSTS.length + 2);
    const p1 = posts.find((p) => p.id === 'post-1')!;
    const before = BLOG_POSTS.find((p) => p.id === 'post-1')!;
    expect(p1.body).toEqual({ en: 'Engineering management is applied systems thinking.', ru: BODY_RU });
    expect({ ...p1, body: undefined }).toEqual({ ...before, body: undefined });
    expect(checkEntry(p1)).toEqual([]);
    // The other stubs are not in this Publora fixture, so they stay as they are.
    for (const p of posts.filter((p) => p.id !== 'post-1' && BLOG_POSTS.some((b) => b.id === p.id))) expect(p).toEqual(BLOG_POSTS.find((b) => b.id === p.id) as BlogPost);
    // The body-only call asks for bodyRu alone, under its own strict schema.
    const bodyCall = toModel(h).find((c) => String(c.body.messages.at(-1).content).includes('applied systems thinking'))!;
    expect(Object.keys(bodyCall.body.response_format.json_schema.schema.properties)).toEqual(['bodyRu']);
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=3$/m);
    expect(h.writes['.publora/pr-body.md']).toMatch(/full text/i);
    expect(h.writes['.publora/pr-body.md']).toContain(before.title.en);
  });

  test('only full text for old posts, nothing new: still one PR', async () => {
    const h = harness({ groups: [GROUPS[1]], posts: BLOG_POSTS as BlogPost[], drafts: { 'applied systems thinking': { bodyRu: BODY_RU } } });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('added');
    expect(written(h)!.length).toBe(BLOG_POSTS.length);
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=1$/m);
    expect(h.writes['/tmp/gh-output']).toMatch(/^title=.*full text/im);
  });

  test('the adaptation is validated like any draft: Russian, no new numbers, not a fragment', async () => {
    for (const bodyRu of ['Engineering management is applied systems thinking.', 'Менеджмент — это на 40% системное мышление и распределённые системы.', 'Коротко.']) {
      const h = harness({ groups: [GROUPS[1]], posts: BLOG_POSTS as BlogPost[], drafts: { 'applied systems thinking': { bodyRu } } });
      const out = await run(h.env, h.deps);
      expect(out.status, bodyRu).toBe('none');
      expect(h.writes[POSTS_JSON]).toBeUndefined();
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

describe('one run stays well inside the job timeout', () => {
  test('at most 5 brief-only posts get their full text per run; the rest come the next day', async () => {
    const stubs = (BLOG_POSTS as BlogPost[]).slice(0, 7);
    const groups = stubs.map((p, i) => ({
      postGroupId: `g-stub-${i}`,
      status: 'published',
      posts: [li(`urn:li:share:${activityId(p.url)}`, 'published', `Stub number ${i} text for the page, long enough to adapt.`)],
    })) as Group[];
    const drafts = Object.fromEntries(stubs.map((_, i) => [`Stub number ${i}`, { bodyRu: `Текст заметки номер ${i} для страницы, достаточно длинный для адаптации.` }]));
    const h = harness({ groups, posts: BLOG_POSTS as BlogPost[], drafts });
    await run(h.env, h.deps);
    expect(toModel(h).length).toBe(5);
    expect(written(h)!.filter((p) => p.body).length).toBe(5);
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=5$/m);
    expect(h.logs.join('\n')).toMatch(/2 .*next run/i);
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
    const h = harness({ groups: [], posts: BLOG_POSTS as BlogPost[], drafts: { 'applied systems thinking': { bodyRu: 'Инженерный менеджмент — это прикладное системное мышление, и команду стоит отлаживать как распределённую систему.' } } });
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
      expect(written(h)!.length).toBe(BLOG_POSTS.length + 2);
    }
  });

  test('a backfill url that is not a LinkedIn url never reaches the model', async () => {
    const h = harness({ groups: [] });
    (h.deps as any).readBackfill = () => [{ activityId: NEW_ID, url: `https://evil.example/share-${NEW_ID}`, text: NEW_TEXT }];
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('none');
    expect(toModel(h).length).toBe(0);
  });

  test('over the cap, the newest posts go first; the PR says how many wait for the run after it is merged', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => (BigInt(NEW_ID) + BigInt(i) * 1000n).toString());
    const drafts = Object.fromEntries(ids.map((_, i) => [`Backfill post ${i} `, { ...DRAFT_NEW, slug: `backfill-post-${i}` }]));
    const h = harness({ groups: [], drafts });
    (h.deps as any).readBackfill = () => ids.map((id, i) => entry(id, `${NEW_TEXT}\n\nBackfill post ${i} closing line.`));
    await run(h.env, h.deps);
    const slugs = written(h)!.slice(0, 8).map((p) => p.slug);
    expect(slugs).toEqual([9, 8, 7, 6, 5, 4, 3, 2].map((i) => `backfill-post-${i}`));
    expect(h.writes['.publora/pr-body.md']).toMatch(/2 more .*after this PR is merged/i);
  });

  test('one run makes at most 8 model calls in all, new posts first; the rest wait for the next run', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => (BigInt(NEW_ID) + BigInt(i) * 1000n).toString());
    const drafts = Object.fromEntries(ids.map((_, i) => [`Backfill post ${i} `, { ...DRAFT_NEW, slug: `backfill-post-${i}` }]));
    const h = harness({ groups: [], drafts });
    (h.deps as any).readBackfill = () => ids.map((id, i) => entry(id, `${NEW_TEXT}\n\nBackfill post ${i} closing line.`));
    await run(h.env, h.deps);
    expect(toModel(h).length).toBe(8);
    expect(h.writes['/tmp/gh-output']).toMatch(/^added=8$/m);
    expect(h.logs.join('\n')).toMatch(/2 .*next run/i);
  });
});
