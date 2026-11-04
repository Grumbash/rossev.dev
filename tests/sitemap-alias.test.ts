// Crawlers and SEO checkers ask for /sitemap.xml out of habit; the sitemap integration emits
// /sitemap-index.xml (which robots.txt points to). The habitual URL permanently redirects to it.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

describe('/sitemap.xml', () => {
  test('permanently redirects to /sitemap-index.xml, with no condition attached', () => {
    const rule = (vercel.redirects ?? []).find((r: { source: string }) => r.source === '/sitemap.xml');
    expect(rule).toBeDefined();
    expect(rule.destination).toBe('/sitemap-index.xml');
    expect(rule.statusCode ?? (rule.permanent ? 308 : 307)).toBeOneOf([301, 308]);
    expect(rule.has).toBeUndefined();
  });

  test('robots.txt still points crawlers at the index', () => {
    expect(readFileSync('public/robots.txt', 'utf8')).toMatch(/Sitemap: https:\/\/rossev\.dev\/sitemap-index\.xml/);
  });
});
