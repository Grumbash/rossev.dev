// Every post is its own file, src/data/posts/<slug>.json. The writing workflow and the Publora sync
// both add and change posts; with one shared posts.json their PRs edited the same file and
// conflicted. Now a run writes only the posts it touched, so the two never meet in one file.
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { BlogPost } from '../src/data/profile';
import { BLOG_POSTS, POSTS_DIR, changedPostFiles, newestFirst, postFile, postJson, readPosts } from '../src/data/posts';

const post = (id: string, published: string, slug = id): BlogPost => ({ ...(BLOG_POSTS[0] as BlogPost), id, slug, published });

describe('the posts directory', () => {
  test('one pretty JSON file per post, named by its slug; no shared posts.json any more', () => {
    expect(existsSync('src/data/posts.json')).toBe(false);
    const files = readdirSync(POSTS_DIR).sort();
    expect(files.length).toBe(BLOG_POSTS.length);
    expect(files).toEqual(BLOG_POSTS.map((p) => `${p.slug}.json`).sort());
    for (const p of BLOG_POSTS) expect(readFileSync(postFile(p), 'utf8'), p.slug).toBe(JSON.stringify(p, null, 2) + '\n');
  });

  test('ids and slugs are unique across the files (two branches can each add one)', () => {
    expect(new Set(BLOG_POSTS.map((p) => p.id)).size).toBe(BLOG_POSTS.length);
    expect(new Set(BLOG_POSTS.map((p) => p.slug)).size).toBe(BLOG_POSTS.length);
  });

  // Backlinks: LinkedIn posts, the CV and other sites link to /writing/<slug>/. A post's slug is its
  // address, so no post that was ever on the site may lose it. New posts only add to this list.
  test('every post address ever published still exists, in both languages', () => {
    const slugs = JSON.parse(readFileSync('tests/fixtures/post-slugs.json', 'utf8')) as string[];
    const now = new Set(BLOG_POSTS.map((p) => p.slug));
    expect(slugs.filter((s) => !now.has(s))).toEqual([]);
    if (existsSync('dist/index.html'))
      for (const s of slugs) for (const page of [`dist/writing/${s}/index.html`, `dist/ru/writing/${s}/index.html`]) expect(existsSync(page), page).toBe(true);
  });

  test('the site reads them newest first, the later post first on the same day', () => {
    expect(BLOG_POSTS).toEqual(readPosts());
    const dates = BLOG_POSTS.map((p) => p.published);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(newestFirst([post('post-3', '2026-01-01'), post('post-12', '2026-01-02'), post('post-10', '2026-01-01')]).map((p) => p.id)).toEqual(['post-12', 'post-10', 'post-3']);
  });
});

describe('what a run writes', () => {
  const a = post('post-1', '2026-01-01', 'a');
  const b = post('post-2', '2026-01-02', 'b');

  test('nothing changed: no files', () => {
    expect(changedPostFiles([a, b], [structuredClone(a), structuredClone(b)])).toEqual([]);
  });

  test('a new post and a changed one: exactly their two files, untouched posts left alone', () => {
    const c = post('post-3', '2026-01-03', 'c');
    const b2 = { ...b, url: 'https://www.linkedin.com/posts/x' };
    expect(changedPostFiles([a, b], [c, a, b2])).toEqual([
      { path: `${POSTS_DIR}/c.json`, json: postJson(c) },
      { path: `${POSTS_DIR}/b.json`, json: postJson(b2) },
    ]);
  });
});
