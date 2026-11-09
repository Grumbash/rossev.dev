// /writing/ in pages: every post, newest first, 12 to a page, and the same per topic.
//   /writing/              all, page 1        /writing/page/2/        all, page 2
//   /writing/ai/           one topic, page 1  /writing/ai/page/2/     one topic, page 2
// The topic pages sit next to the post pages (/writing/<slug>/), so no post may take a topic's
// name or "page" as its slug: tests/writing.test.ts checks that.
import type { BlogPost } from './profile';
import { BLOG_POSTS } from './posts';
import { localeParams } from '../i18n';

export const WRITING_PAGE_SIZE = 12;
export const TOPICS = ['ai', 'leadership', 'systems', 'delivery'] as const;
export type Topic = (typeof TOPICS)[number];
export type TopicOrAll = Topic | 'all';

export const writingPath = (topic: TopicOrAll, page = 1) =>
  `/writing/${topic === 'all' ? '' : `${topic}/`}${page > 1 ? `page/${page}/` : ''}`;

export const topicPosts = (topic: TopicOrAll, posts: BlogPost[] = BLOG_POSTS) =>
  [...(topic === 'all' ? posts : posts.filter((p) => p.category === topic))].sort((a, b) =>
    b.published.localeCompare(a.published),
  );

export const pageCount = (topic: TopicOrAll, posts: BlogPost[] = BLOG_POSTS) =>
  Math.max(1, Math.ceil(topicPosts(topic, posts).length / WRITING_PAGE_SIZE));

export const pagePosts = (topic: TopicOrAll, page: number, posts: BlogPost[] = BLOG_POSTS) =>
  topicPosts(topic, posts).slice((page - 1) * WRITING_PAGE_SIZE, page * WRITING_PAGE_SIZE);

// Every page of a topic, in order: ['/writing/', '/writing/page/2/', ...].
export const writingPagePaths = (topic: TopicOrAll) => range(1, pageCount(topic)).map((n) => writingPath(topic, n));

// getStaticPaths for each route shape, per locale. Page 1 never has a /page/1/ twin.
export const allPagePaths = () =>
  localeParams().flatMap((params) =>
    range(2, pageCount('all')).map((n) => ({ params: { ...params, n: String(n) } })),
  );
export const topicPaths = () =>
  localeParams().flatMap((params) => TOPICS.map((topic) => ({ params: { ...params, topic } })));
export const topicPagePaths = () =>
  localeParams().flatMap((params) =>
    TOPICS.flatMap((topic) => range(2, pageCount(topic)).map((n) => ({ params: { ...params, topic, n: String(n) } }))),
  );

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
