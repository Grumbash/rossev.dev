// Data and buyer guides live on yagni.app, the story around them on rossev.dev (docs/content/strategy.md).
// Two articles here cover the same ground as YAGNI guides, so each links its guide, in the source and
// in both languages of the built entry. Links go one way only: rossev.dev → yagni.app.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const GUIDES: Record<string, string> = {
  'what-one-pr-costs-us': 'https://yagni.app/blog/ai-coding-tools-cost/',
  'benchmarking-review-models-on-our-own-prs': 'https://yagni.app/blog/ai-code-review-tools/'
};

describe('articles that overlap a YAGNI guide link to it', () => {
  for (const [slug, guide] of Object.entries(GUIDES)) {
    test(slug, () => {
      expect(readFileSync(`src/content/writing/${slug}.md`, 'utf8')).toContain(`](${guide})`);
      const post = JSON.parse(readFileSync(`src/data/posts/${slug}.json`, 'utf8'));
      for (const l of ['en', 'ru'] as const) expect(post.body[l], `${slug} body.${l}`).toContain(`](${guide})`);
    });
  }
});
