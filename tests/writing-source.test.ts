// Posts written on the site: Gleb writes src/content/writing/<slug>.md with a title, a category,
// the platforms to send it to and the text, in English or Russian. scripts/ci/writing.ts, run on his
// PR by .github/workflows/writing.yml, has a cheap model write the other language and the brief,
// checks the answer, writes the entry to its file in src/data/posts/ and creates a Publora draft per
// platform; scheduling stays his. OpenRouter and Publora are mocked here.
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { BlogPost } from '../src/data/profile';
import { WRITING_DIR, buildMessages, parseSource, run, upToDate, validateDraft, type Source } from '../scripts/ci/writing';
import { siteCopyOf } from '../scripts/ci/publora-sync';
import { readPosts } from '../src/data/posts';
import { postsAfter } from './fixtures/posts';

const SITE = JSON.parse(readFileSync('tests/fixtures/publora/site-posts.json', 'utf8')) as BlogPost[];

const TEXT_EN = [
  'Most teams do not have a velocity problem. They have a waiting problem.',
  '',
  'I looked at 3 weeks of pull requests: 70% of lead time was PRs waiting for a reviewer. Nobody was typing slowly; the work sat in a queue.',
  '',
  '## What to do',
  '',
  '- Fix the queue before you hire.',
  '- Make review the first thing in the morning, not the last.',
].join('\n');
const FILE_EN = `---\ntitle: Your Team Has a Waiting Problem\ncategory: delivery\ndistribute: [linkedin]   # where it goes\n---\n\n${TEXT_EN}\n`;

const TEXT_RU = [
  'У большинства команд нет проблемы со скоростью. У них проблема с ожиданием.',
  '',
  'Я посмотрел 3 недели пул-реквестов: 70% времени поставки PR ждали ревьюера. Никто не печатал медленно, работа стояла в очереди.',
  '',
  'Сначала почините очередь, потом нанимайте. Ревью — первое дело утром, а не последнее вечером.',
].join('\n');
const FILE_RU = `---\ntitle: "У команды проблема с ожиданием"\ncategory: delivery\ndistribute: []\n---\n${TEXT_RU}\n`;

const DRAFT_EN = {
  title: 'У команды проблема не со скоростью, а с ожиданием',
  tags: ['Flow', 'Code Review'],
  takeaway: { en: 'Fix the review queue before you hire more engineers.', ru: 'Почините очередь на ревью, прежде чем нанимать людей.' },
  quote: { en: 'Fix the queue before you hire.', ru: 'Сначала почините очередь, потом нанимайте.' },
  bullets: {
    en: ['Over 3 weeks of pull requests, 70% of lead time was PRs waiting.', 'Slow delivery is usually queueing, not slow typing.', 'Shorten the review queue before adding headcount.'],
    ru: ['За 3 недели пул-реквестов 70% времени поставки ушло на ожидание.', 'Медленная поставка — обычно очередь, а не медленная работа.', 'Сократите очередь на ревью до того, как расширять команду.'],
  },
  body: [
    'У большинства команд нет проблемы со скоростью. У них проблема с ожиданием.',
    '',
    'Я посмотрел 3 недели пул-реквестов: 70% времени поставки PR ждали ревьюера. Никто не печатал медленно, работа стояла в очереди.',
    '',
    '## Что делать',
    '',
    '- Сначала почините очередь, потом нанимайте.',
    '- Ревью — первое дело утром, а не последнее.',
  ].join('\n'),
};
const DRAFT_RU = {
  ...DRAFT_EN,
  title: 'Your Team Has a Waiting Problem, Not a Velocity Problem',
  body: 'Most teams do not have a velocity problem. They have a waiting problem.\n\nI looked at 3 weeks of pull requests: 70% of lead time was PRs waiting for a reviewer. Nobody typed slowly; the work sat in a queue.\n\nFix the queue before you hire. Review comes first in the morning, not last at night.',
};

const src = (file: string, raw: string) => {
  const r = parseSource(file, raw);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.source;
};

type Call = { url: string; method: string; body: any };
function harness(o: { files?: { file: string; raw: string }[]; posts?: BlogPost[]; drafts?: Record<string, unknown>; status?: string; publoraKey?: string } = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const writes: Record<string, string> = {};
  const drafts = o.drafts ?? { 'Waiting Problem': DRAFT_EN, 'проблема с ожиданием': DRAFT_RU };
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method: init.method ?? 'GET', body });
    if (url.startsWith('https://api.publora.com/')) {
      const path = new URL(url).pathname.replace('/api/v1', '');
      if (path === '/platform-connections') return Response.json({ success: true, connections: [{ platformId: 'twitter-1' }, { platformId: 'linkedin-zgR' }] });
      if (path === '/create-post') return Response.json({ success: true, postGroupId: 'pg-new' });
      if (path.startsWith('/get-post/')) return Response.json({ success: true, postGroupId: path.split('/').pop(), status: o.status ?? 'draft', content: null, posts: [] });
      if (path.startsWith('/update-post/')) return Response.json({ success: true });
      return new Response('unexpected', { status: 599 });
    }
    if (url.startsWith('https://openrouter.ai/')) {
      const user = String(body.messages.at(-1).content);
      const key = Object.keys(drafts).find((k) => user.includes(k));
      const content = key === undefined ? 'not json' : JSON.stringify(drafts[key]);
      return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.0005 } });
    }
    return new Response('unexpected', { status: 599 });
  }) as unknown as typeof fetch;
  const env = { OPENROUTER_API_KEY: 'sk-or-test-secret', PUBLORA_API_KEY: o.publoraKey ?? 'sk_publora_test_secret', GITHUB_OUTPUT: '/tmp/out', PR_BODY_PATH: '.writing/pr-comment.md' };
  const deps = {
    fetch: fetchImpl,
    readSources: () => o.files ?? [{ file: 'waiting-problem.md', raw: FILE_EN }],
    readPosts: () => structuredClone(o.posts ?? SITE),
    now: () => Date.parse('2026-11-05T10:00:00Z'),
    writeFile: (p: string, s: string) => void (writes[p] = (writes[p] ?? '') + s),
    log: (s: string) => void logs.push(s),
  };
  return { calls, logs, writes, env, deps, base: o.posts ?? SITE };
}
const posts = (h: ReturnType<typeof harness>): BlogPost[] => postsAfter(h.base, h.writes)!;
const publoraCalls = (h: ReturnType<typeof harness>) => h.calls.filter((c) => c.url.startsWith('https://api.publora.com/')).map((c) => `${c.method} ${new URL(c.url).pathname.replace('/api/v1', '')}`);

describe('the source file', () => {
  test('front matter gives title, category and platforms; the file name is the slug; the language is detected', () => {
    const en = src('waiting-problem.md', FILE_EN);
    expect(en).toEqual({ slug: 'waiting-problem', title: 'Your Team Has a Waiting Problem', category: 'delivery', distribute: ['linkedin'], text: TEXT_EN, lang: 'en', depth: false });
    const ru = src('waiting-ru.md', FILE_RU);
    expect([ru.title, ru.lang, ru.distribute]).toEqual(['У команды проблема с ожиданием', 'ru', []]);
    expect(src('x-y.md', FILE_EN.replace('distribute: [linkedin]   # where it goes\n', '')).distribute).toEqual([]);
  });

  test('a broken file says what to fix', () => {
    const errors = (file: string, raw: string) => {
      const r = parseSource(file, raw);
      return r.ok ? [] : r.errors.join('; ');
    };
    expect(errors('Waiting Problem.md', FILE_EN)).toContain('file name');
    expect(errors('a.md', TEXT_EN)).toContain('front matter');
    expect(errors('a.md', FILE_EN.replace('category: delivery', 'category: rants'))).toContain('category');
    expect(errors('a.md', FILE_EN.replace('[linkedin]', '[linkedin, myspace]'))).toContain('myspace');
    expect(errors('a.md', FILE_EN.replace('[linkedin]', 'linkedin'))).toContain('distribute');
    expect(errors('a.md', FILE_EN.replace('title:', 'titel:'))).toContain('titel');
    expect(errors('a.md', `---\ntitle: Short post here\ncategory: ai\n---\nToo short.`)).toContain('text');
  });
});

describe("the model's draft", () => {
  test('a good answer passes, both ways', () => {
    expect(validateDraft(JSON.stringify(DRAFT_EN), src('a.md', FILE_EN)).ok).toBe(true);
    expect(validateDraft(DRAFT_RU, src('a.md', FILE_RU)).ok).toBe(true);
  });

  test('the other language must really be the other language, and numbers come from the text', () => {
    const bad = (d: unknown, s: Source) => {
      const r = validateDraft(d, s);
      return r.ok ? '' : r.errors.join('; ');
    };
    const en = src('a.md', FILE_EN);
    expect(bad({ ...DRAFT_EN, body: TEXT_EN }, en)).toContain('body: not Russian');
    expect(bad({ ...DRAFT_EN, title: 'Your Team Has a Waiting Problem' }, en)).toContain('title: not Russian');
    expect(bad({ ...DRAFT_EN, takeaway: { ...DRAFT_EN.takeaway, en: 'Fix the review queue: 40% of teams never do it at all.' } }, en)).toContain('number 40');
    expect(bad({ ...DRAFT_EN, extra: 1 }, en)).toContain('unexpected');
    expect(bad('not json', en)).toBe('not JSON');
  });

  test('the post goes to the model fenced as data, and the prompt names both languages', () => {
    const m = buildMessages(src('a.md', FILE_RU));
    expect(m[0].content).toContain('in Russian');
    expect(m[0].content).toContain('the English version');
    expect(m[1].content).toMatch(/<post>\n# У команды проблема с ожиданием\n\n/);
  });
});

describe('the run', () => {
  test('a new English post gets an entry on top and a LinkedIn draft with the English text', async () => {
    const h = harness();
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('written');
    const [top, ...rest] = posts(h);
    expect(rest).toEqual(SITE);
    expect(top).toMatchObject({
      id: 'post-10',
      slug: 'waiting-problem',
      published: '2026-11-05',
      category: 'delivery',
      title: { en: 'Your Team Has a Waiting Problem', ru: DRAFT_EN.title },
      body: { en: TEXT_EN, ru: DRAFT_EN.body },
      publora: 'pg-new',
    });
    expect(top.url).toBeUndefined();
    expect(publoraCalls(h)).toEqual(['GET /platform-connections', 'POST /create-post']);
    expect(h.calls.find((c) => c.url.endsWith('/create-post'))!.body).toEqual({ content: TEXT_EN, platforms: ['linkedin-zgR'] });
    expect(h.writes['/tmp/out']).toBe('changed=1\n');
    expect(h.writes['.writing/pr-comment.md']).toContain('LinkedIn draft created (pg-new)');
    expect(h.logs.join('\n')).not.toContain('secret');
  });

  test('a Russian post keeps its Russian as written and sends the English version to LinkedIn', async () => {
    const h = harness({ files: [{ file: 'waiting-ru.md', raw: FILE_RU.replace('distribute: []', 'distribute: [linkedin]') }] });
    await run(h.env, h.deps);
    const top = posts(h)[0];
    expect(top.title).toEqual({ en: DRAFT_RU.title, ru: 'У команды проблема с ожиданием' });
    expect(top.body).toEqual({ en: DRAFT_RU.body, ru: TEXT_RU });
    expect(h.calls.find((c) => c.url.endsWith('/create-post'))!.body.content).toBe(DRAFT_RU.body);
  });

  test('distribute: [] puts the post on the site only', async () => {
    const h = harness({ files: [{ file: 'waiting-ru.md', raw: FILE_RU }] });
    await run(h.env, h.deps);
    expect(posts(h)[0].publora).toBeUndefined();
    expect(publoraCalls(h)).toEqual([]);
  });

  test('a post already up to date costs nothing and writes nothing', async () => {
    const first = harness();
    await run(first.env, first.deps);
    const h = harness({ posts: posts(first) });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('none');
    expect(h.calls).toEqual([]);
    expect(postsAfter(h.base, h.writes)).toBeUndefined();
    expect(h.writes['/tmp/out']).toBe('changed=0\n');
  });

  test('an edited post is redrafted in place, keeps its id, date and color, and its draft gets the new text', async () => {
    const first = harness();
    await run(first.env, first.deps);
    const before = posts(first)[0];
    const old = posts(first).map((p) => (p.id === before.id ? { ...p, published: '2026-11-01', color: 'var(--pink)' } : p));
    const edited = FILE_EN.replace('first thing in the morning', 'first thing after standup');
    const h = harness({ files: [{ file: 'waiting-problem.md', raw: edited }], posts: old });
    await run(h.env, h.deps);
    const after = posts(h)[0];
    expect([after.id, after.published, after.color, after.publora]).toEqual([before.id, '2026-11-01', 'var(--pink)', 'pg-new']);
    expect(after.body!.en).toContain('after standup');
    expect(posts(h)).toHaveLength(old.length);
    expect(publoraCalls(h)).toEqual(['GET /platform-connections', 'GET /get-post/pg-new', 'PUT /update-post/pg-new']);
    expect(h.calls.at(-1)!.body).toEqual({ content: after.body!.en });
  });

  test('a draft already scheduled is never rewritten; the PR says to change it by hand', async () => {
    const first = harness();
    await run(first.env, first.deps);
    const h = harness({ files: [{ file: 'waiting-problem.md', raw: FILE_EN.replace('slowly', 'too slowly') }], posts: posts(first), status: 'scheduled' });
    const out = await run(h.env, h.deps);
    expect(publoraCalls(h)).not.toContain('PUT /update-post/pg-new');
    expect(out.problems[0].text).toContain('is scheduled');
    expect(h.writes['.writing/pr-comment.md']).toContain('change it in Publora by hand');
  });

  test('a bad answer or a broken file writes nothing for that post and says why', async () => {
    const h = harness({ drafts: {}, files: [{ file: 'waiting-problem.md', raw: FILE_EN }, { file: 'Bad Name.md', raw: FILE_EN }] });
    const out = await run(h.env, h.deps);
    expect(out.status).toBe('none');
    expect(out.problems.map((p) => p.slug)).toEqual(['Bad Name.md', 'waiting-problem']);
    expect(postsAfter(h.base, h.writes)).toBeUndefined();
    expect(publoraCalls(h)).toEqual([]);
  });

  test('without a Publora key the post still lands on the site, and the PR says there is no draft', async () => {
    const h = harness({ publoraKey: '' });
    const out = await run(h.env, h.deps);
    expect(posts(h)[0].publora).toBeUndefined();
    expect(out.problems[0].text).toContain('PUBLORA_API_KEY');
  });
});

describe('the LinkedIn copy', () => {
  test('when the draft goes out, the Publora sync links the post by its postGroupId instead of adding a second entry', () => {
    const site = [{ ...SITE[0], url: undefined, body: { en: 'x', ru: 'х' }, publora: 'pg-new' } as BlogPost, ...SITE.slice(1)];
    expect(siteCopyOf({ postGroupId: 'pg-new', content: 'no link here' }, site)).toBe(0);
    expect(siteCopyOf({ postGroupId: 'pg-other', content: 'no link here' }, site)).toBe(-1);
  });
});

describe('the repo', () => {
  test('every file in src/content/writing is on the site, up to date: merge only after the bot commit', () => {
    const site = readPosts();
    const files = existsSync(WRITING_DIR) ? readdirSync(WRITING_DIR).filter((f) => f.endsWith('.md')) : [];
    for (const f of files) {
      const r = parseSource(f, readFileSync(`${WRITING_DIR}/${f}`, 'utf8'));
      expect(r.ok ? [] : r.errors).toEqual([]);
      if (!r.ok) continue;
      const e = site.find((p) => p.slug === r.source.slug);
      expect(e && upToDate(e, r.source), `${f}: not in src/data/posts/ or changed since; the writing workflow fills it in`).toBe(true);
    }
  });
});
