// The posts, one file each: src/data/posts/<slug>.json. The writing workflow
// (scripts/ci/writing.ts) and the Publora sync (scripts/ci/publora-sync.ts) both add and change
// posts; each writes only the files of the posts it touched, so their PRs never edit the same file.
// Server-side only (node:fs): pages and scripts import it, client scripts import profile.ts.
import { readdirSync, readFileSync } from 'node:fs';
import type { BlogPost } from './profile';

export const POSTS_DIR = 'src/data/posts';

export const postFile = (post: Pick<BlogPost, 'slug'>) => `${POSTS_DIR}/${post.slug}.json`;

// Stable, pretty JSON with a trailing newline: machine edits make small diffs.
export const postJson = (post: BlogPost) => JSON.stringify(post, null, 2) + '\n';

const idNumber = (post: BlogPost) => Number(post.id.replace('post-', '')) || 0;

// Newest first; on the same day the later post (the higher id) first.
export const newestFirst = (posts: BlogPost[]) =>
  [...posts].sort((a, b) => b.published.localeCompare(a.published) || idNumber(b) - idNumber(a));

export const readPosts = (): BlogPost[] =>
  newestFirst(
    readdirSync(POSTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(`${POSTS_DIR}/${f}`, 'utf8'))),
  );

/** The files a run writes: its new posts and the ones it changed, in `after` order; nothing else. */
export function changedPostFiles(before: BlogPost[], after: BlogPost[]) {
  const old = new Map(before.map((p) => [p.id, postJson(p)]));
  return after.filter((p) => old.get(p.id) !== postJson(p)).map((p) => ({ path: postFile(p), json: postJson(p) }));
}

export const BLOG_POSTS: BlogPost[] = readPosts();
