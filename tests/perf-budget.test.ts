// Speed is part of what this site claims about its author. These tests hold the built page to
// byte budgets from one file, perf-budgets.json, and prove the checker behind the CI perf gate
// really fails on a regression. The CI wiring itself is pinned in tests/ci.test.ts.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import budgets from '../perf-budgets.json';
import {
  evaluateBytes,
  evaluateLighthouse,
  failingFormFactors,
  formatCheck,
  statusLine,
  type Check,
} from '../scripts/perf-check';

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

let checks: Check[] = [];

beforeAll(() => {
  execSync('bun run build', { stdio: 'ignore' });
  checks = evaluateBytes('dist', budgets.bytes);
});

const within = (name: string) => {
  const c = checks.find((x) => x.name === name);
  expect(c).toBeDefined();
  // Throw the formatted line so a red push says which budget, which files, how many bytes over.
  if (!c!.ok) throw new Error(`over budget: ${formatCheck(c!)}`);
};

describe('the built page stays within its byte budgets', () => {
  test('index.html, gzipped', () => within('html-gzip'));
  test('inline <style> in index.html, raw', () => within('inline-style'));
  test('first-party JS the page loads, gzipped and summed', () => within('first-party-js-gzip'));
  test('every single _astro chunk, gzipped', () => within('single-chunk-gzip'));
  test('preloaded fonts, raw and summed', () => within('preloaded-fonts'));
  test('no more preloaded font files than allowed', () => within('preloaded-font-count'));
  test('the checker actually saw the page: html, JS and fonts are non-empty', () => {
    for (const n of ['html-gzip', 'inline-style', 'first-party-js-gzip', 'preloaded-fonts']) {
      expect(checks.find((c) => c.name === n)!.actual).toBeGreaterThan(0);
    }
    expect(checks.find((c) => c.name === 'first-party-js-gzip')!.files).toContain('htmx.min.js');
  });
});

describe('the checker fails on a regression', () => {
  test('a fat chunk in a fake dist is reported as exactly that breach, with file and numbers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'perf-dist-'));
    mkdirSync(join(dir, '_astro'));
    // Random bytes do not compress, so gzip size stays close to raw size.
    const fat = Buffer.from(Array.from({ length: 30_000 }, () => Math.floor(Math.random() * 256)));
    writeFileSync(join(dir, '_astro', 'fat.js'), fat);
    writeFileSync(join(dir, '_astro', 'f.woff2'), Buffer.alloc(1000));
    writeFileSync(
      join(dir, 'index.html'),
      '<html><head><style>body{color:red}</style>' +
        '<link rel="preload" href="/_astro/f.woff2" as="font" type="font/woff2" crossorigin>' +
        '<script type="module" src="/_astro/fat.js"></script>' +
        '<script src="https://cloud.umami.is/script.js" defer></script></head><body>hi</body></html>',
    );

    const result = evaluateBytes(dir, { ...budgets.bytes, firstPartyJsGzip: 1_000_000 });
    const breaches = result.filter((c) => !c.ok);
    expect(breaches.map((c) => c.name)).toEqual(['single-chunk-gzip']);
    const [b] = breaches;
    expect(b.files).toEqual(['_astro/fat.js']);
    expect(b.limit).toBe(budgets.bytes.singleChunkGzip);
    expect(b.actual).toBeGreaterThan(budgets.bytes.singleChunkGzip);
    const line = formatCheck(b);
    expect(line).toContain('single-chunk-gzip');
    expect(line).toContain('_astro/fat.js');
    expect(line).toContain(String(b.actual));
    expect(line).toContain(String(b.limit));
    // The external Umami script is not in dist and must not count or crash the checker.
    expect(result.find((c) => c.name === 'first-party-js-gzip')!.files).toEqual(['_astro/fat.js']);
  });

  test('JS pulled in by <link rel="modulepreload"> counts toward the first-party JS budget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'perf-dist-'));
    mkdirSync(join(dir, '_astro'));
    const noise = (n: number) => Buffer.from(Array.from({ length: n }, () => Math.floor(Math.random() * 256)));
    writeFileSync(join(dir, '_astro', 'entry.js'), noise(2_000));
    writeFileSync(join(dir, '_astro', 'shared.js'), noise(5_000));
    writeFileSync(
      join(dir, 'index.html'),
      '<html><head><link rel="modulepreload" href="/_astro/shared.js">' +
        '<script type="module" src="/_astro/entry.js"></script></head><body></body></html>',
    );
    const js = evaluateBytes(dir, { ...budgets.bytes, firstPartyJsGzip: 4_000 }).find((c) => c.name === 'first-party-js-gzip')!;
    expect(js.files.sort()).toEqual(['_astro/entry.js', '_astro/shared.js']);
    expect(js.actual).toBeGreaterThan(7_000);
    expect(js.ok).toBe(false);
  });

  test('Lighthouse results are judged on the median of runs, per form factor', () => {
    const lhr = (score: number, lcp: number, cls: number, tbt: number) => ({
      categories: { performance: { score } },
      audits: {
        'largest-contentful-paint': { numericValue: lcp },
        'cumulative-layout-shift': { numericValue: cls },
        'total-blocking-time': { numericValue: tbt },
      },
    });
    const result = evaluateLighthouse(
      {
        // One terrible outlier run must not fail mobile: the median is 1.0 / 1800 / 0 / 0.
        mobile: [lhr(1, 1800, 0, 0), lhr(0.4, 9000, 0.5, 900), lhr(1, 1700, 0, 0)],
        // Two of three desktop runs have a slow LCP: the median 900ms breaches the 800ms limit.
        desktop: [lhr(1, 400, 0, 0), lhr(0.99, 900, 0, 0), lhr(0.99, 950, 0, 0)],
      },
      budgets.lighthouse,
    );
    const breaches = result.filter((c) => !c.ok);
    expect(breaches.map((c) => c.name)).toEqual(['desktop LCP']);
    expect(breaches[0].actual).toBe(900);
    expect(breaches[0].limit).toBe(budgets.lighthouse.desktop.lcp);
    expect(result.find((c) => c.name === 'mobile score')!.actual).toBe(1);

    const low = evaluateLighthouse({ mobile: [lhr(0.9, 1000, 0, 0)], desktop: [lhr(1, 400, 0, 0)] }, budgets.lighthouse);
    expect(low.filter((c) => !c.ok).map((c) => c.name)).toEqual(['mobile score']);

    // A Lighthouse breach is re-run only for the form factor that failed.
    expect(failingFormFactors(result)).toEqual(['desktop']);
    expect(failingFormFactors(low)).toEqual(['mobile']);
    expect(failingFormFactors(checks)).toEqual([]);
  });

  test('the status line never claims a pass Lighthouse did not give', () => {
    const ok = checks.map((c) => ({ ...c, ok: true }));
    expect(statusLine(ok, false)).toContain('byte budgets met; Lighthouse NOT run');
    expect(statusLine(ok, true)).toContain('all budgets met');
    expect(statusLine([{ ...ok[0], ok: false }], false)).toContain('1 budget(s) breached');
  });

  test('a failed stage replaces any stale report with ERROR: <stage> and exits 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'perf-run-'));
    writeFileSync(join(dir, 'perf-budgets.json'), JSON.stringify(budgets));
    mkdirSync(join(dir, '.perf'));
    writeFileSync(join(dir, '.perf', 'last-report.md'), '# Perf report — ok (stale)');
    // A target without a build script: the build stage must fail.
    mkdirSync(join(dir, 'site'));
    writeFileSync(join(dir, 'site', 'package.json'), '{"name":"x","scripts":{}}');
    const run = spawnSync('bun', [resolve('scripts/perf-check.ts'), 'site'], {
      cwd: dir,
      env: { ...process.env, PERF_SKIP_LIGHTHOUSE: '1' },
    });
    expect(run.status).toBe(1);
    const report = readFileSync(join(dir, '.perf', 'last-report.md'), 'utf8');
    expect(report).toContain('ERROR: build:');
    expect(report).not.toContain('stale');
  });
});
