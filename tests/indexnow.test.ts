// IndexNow (.github/workflows/indexnow.yml) pings Bing after each production deploy. It only
// works while public/<KEY>.txt serves exactly the key the script sends.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { KEY, locs } from '../scripts/indexnow.ts';

describe('indexnow', () => {
  test('the public key file serves the key the script sends', () => {
    expect(readFileSync(`public/${KEY}.txt`, 'utf8').trim()).toBe(KEY);
  });

  test('locs reads every <loc> from a sitemap or a sitemap index', () => {
    const xml =
      '<urlset><url><loc>https://rossev.dev/</loc><xhtml:link href="https://rossev.dev/x"/></url>' +
      '<url><loc>\n  https://rossev.dev/cases/kingpin/\n</loc></url></urlset>';
    expect(locs(xml)).toEqual(['https://rossev.dev/', 'https://rossev.dev/cases/kingpin/']);
  });
});
