// The posts after a mocked run of the writing workflow or the Publora sync: the post files it wrote
// laid over the posts it read, new ones on top in the order written. Undefined: it wrote none.
import type { BlogPost } from '../../src/data/profile';
import { POSTS_DIR } from '../../src/data/posts';

export function postsAfter(base: BlogPost[], writes: Record<string, string>): BlogPost[] | undefined {
  const files = Object.entries(writes)
    .filter(([path]) => path.startsWith(`${POSTS_DIR}/`))
    .map(([, json]) => JSON.parse(json) as BlogPost);
  if (!files.length) return undefined;
  const byId = new Map(files.map((p) => [p.id, p]));
  const old = new Set(base.map((p) => p.id));
  return [...files.filter((p) => !old.has(p.id)), ...base.map((p) => byId.get(p.id) ?? p)];
}
