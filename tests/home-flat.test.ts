// Home must not grow with the posts the Publora sync adds: the bot's job runs these tests, so a
// long generated title or takeaway would otherwise fail its PR on the home byte budget. Home is
// built in a scratch copy of the site with 20 posts at the validator's maximum lengths on top of
// the real ones (the 6 newest are all long), and must stay under the same budget in each locale.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BLOG_POSTS, HOME_POST_COUNT, type BlogPost } from '../src/data/profile';

setDefaultTimeout(240_000);

// Same target as tests/i18n.test.ts; the long posts must fit it, not move it.
const HOME_GZIP_TARGET = 26_000;
const LONG_POSTS = 20;
const gz = (s: string) => gzipSync(s, { level: 9 }).length;

// Varied words from the real briefs, so the fixture compresses like real text, not like a repeat.
const pool = (l: 'en' | 'ru') => BLOG_POSTS.flatMap((p) => [...p.brief.bullets[l], p.brief.quote[l]]).join(' ').split(/\s+/).filter(Boolean);
let seed = 7;
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
const text = (l: 'en' | 'ru', len: number) => {
  const words = pool(l);
  let s = '';
  while (s.length < len) s += (s ? ' ' : '') + words[rnd(words.length)];
  return s.slice(0, len).trim();
};
const both = (len: number) => ({ en: text('en', len), ru: text('ru', len) });

// The validator's ceilings (scripts/ci/publora-sync.ts): title 140, takeaway 220, 3 tags of 40.
const longPost = (i: number): BlogPost => ({
  id: `post-${1000 + i}`,
  slug: `long-fixture-post-${i}`,
  published: `2027-01-${String(i + 1).padStart(2, '0')}`,
  category: 'ai',
  categoryLabel: { en: 'AI SYSTEMS', ru: 'AI-СИСТЕМЫ' },
  originalMinutes: 12,
  url: `https://www.linkedin.com/posts/rossev_${text('en', 60).toLowerCase().replace(/[^a-z]+/g, '-')}-share-75${String(i).padStart(17, '0')}-AbCd`,
  title: both(140),
  takeaway: both(220),
  tags: [text('en', 40), text('en', 40), text('en', 40)],
  brief: { quote: both(280), bullets: { en: [text('en', 200), text('en', 200), text('en', 200)], ru: [text('ru', 200), text('ru', 200), text('ru', 200)] } },
  body: { en: text('en', 3000), ru: text('ru', 3000) },
  color: BLOG_POSTS[0].color,
});

let dir = '';
let en = '';
let ru = '';

beforeAll(() => {
  // Inside the repo (gitignored), so the copy resolves this checkout's node_modules by walking up;
  // a symlinked node_modules confuses Astro's compile cache.
  mkdirSync('.home-flat', { recursive: true });
  dir = mkdtempSync(join('.home-flat', 'build-'));
  for (const p of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) cpSync(p, join(dir, p), { recursive: true });
  const posts = [...Array.from({ length: LONG_POSTS }, (_, i) => longPost(i)), ...BLOG_POSTS];
  writeFileSync(join(dir, 'src/data/posts.json'), JSON.stringify(posts, null, 2));
  execSync(`${resolve('node_modules/.bin/astro')} build`, { cwd: dir, stdio: 'pipe', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  en = readFileSync(join(dir, 'dist/index.html'), 'utf8');
  ru = readFileSync(join(dir, 'dist/ru/index.html'), 'utf8');
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe(`home with ${LONG_POSTS} maximum-length posts on top`, () => {
  test('the fixture really is on home: its newest posts fill the cards', () => {
    expect(en).toContain('/writing/long-fixture-post-19/');
    expect(en).toContain(`/writing/long-fixture-post-${LONG_POSTS - HOME_POST_COUNT}/`);
    expect(en).not.toContain(`/writing/long-fixture-post-${LONG_POSTS - HOME_POST_COUNT - 1}/`);
  });

  test(`is still at most ${HOME_GZIP_TARGET} B gzipped in each locale`, () => {
    expect(gz(en)).toBeLessThanOrEqual(HOME_GZIP_TARGET);
    expect(gz(ru)).toBeLessThanOrEqual(HOME_GZIP_TARGET);
  });
});
