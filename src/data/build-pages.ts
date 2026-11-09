// "How it's built" in pages: the merged PRs newest first, 10 to a page.
//   /how-its-built/          the loop, the stats and the latest 10 PRs
//   /how-its-built/page/2/   the next 10, and so on
import { localeParams } from '../i18n';

export const BUILD_PAGE_SIZE = 10;

type Pr = { number: number; mergedAt: string };

export const buildPagePath = (page: number) => `/how-its-built/${page > 1 ? `page/${page}/` : ''}`;

export const newestFirst = <T extends Pr>(prs: T[]) =>
  [...prs].sort((a, b) => b.mergedAt.localeCompare(a.mergedAt) || b.number - a.number);

export const buildPageCount = (prs: Pr[]) => Math.max(1, Math.ceil(prs.length / BUILD_PAGE_SIZE));

export const buildPagePrs = <T extends Pr>(prs: T[], page: number) =>
  newestFirst(prs).slice((page - 1) * BUILD_PAGE_SIZE, page * BUILD_PAGE_SIZE);

export const buildPagePaths = (prs: Pr[]) => Array.from({ length: buildPageCount(prs) }, (_, i) => buildPagePath(i + 1));

// getStaticPaths for /how-its-built/page/<n>/, per locale; page 1 is /how-its-built/ itself.
export const buildPageStaticPaths = (prs: Pr[]) =>
  localeParams().flatMap((params) =>
    Array.from({ length: Math.max(0, buildPageCount(prs) - 1) }, (_, i) => ({ params: { ...params, n: String(i + 2) } })),
  );
