// Speed is part of what this site claims about its author, and there is no CI to notice when
// a change makes it slower. These tests hold the built page to byte budgets from one file,
// perf-budgets.json, prove the checker behind the pre-push hook really fails on a regression,
// pin the hook wiring so a push runs it, and pin which pushes the hook measures (the pushed
// commits, not the working tree; nothing for tags, deletions or docs-only pushes).
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

describe('which pushes get measured (scripts/push-range.sh)', () => {
  const Z = '0'.repeat(40);
  let repo = '';
  const git = (args: string) =>
    execSync(`git -c user.name=t -c user.email=t@t -c core.hooksPath=/dev/null ${args}`, { cwd: repo }).toString().trim();
  const commit = (file: string) => {
    mkdirSync(join(repo, file, '..'), { recursive: true });
    writeFileSync(join(repo, file), String(Math.random()));
    git(`add -A`);
    git(`commit -qm "${file}"`);
    return git('rev-parse HEAD');
  };
  const ranges = (stdin: string, remote = 'origin') =>
    execSync(`sh ${resolve('scripts/push-range.sh')} ${remote}`, { cwd: repo, input: stdin }).toString().trim();

  let main = '';
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'push-range-'));
    execSync('git init -q -b main', { cwd: repo });
    main = commit('src/index.astro');
    git('update-ref refs/remotes/origin/main HEAD');
  });

  test('a new branch is measured from its merge-base with <remote>/main', () => {
    git('checkout -qb feat');
    const a = commit('src/a.astro');
    const b = commit('src/b.astro');
    expect(ranges(`refs/heads/feat ${b} refs/heads/feat ${Z}\n`)).toBe(`${b} ${main}..${b}`);
    // An update is measured from what the remote already has.
    expect(ranges(`refs/heads/feat ${b} refs/heads/feat ${a}\n`)).toBe(`${b} ${a}..${b}`);
  });

  test('without <remote>/main, a new branch starts after the commits the remote already has', () => {
    git('checkout -qb other main');
    git('update-ref refs/remotes/origin/other main');
    git('update-ref -d refs/remotes/origin/main');
    const c = commit('public/c.txt');
    expect(ranges(`refs/heads/other ${c} refs/heads/other ${Z}\n`)).toBe(`${c} ${main}..${c}`);
    git('update-ref refs/remotes/origin/main main');
  });

  test('deletions, tags and docs-only pushes are skipped', () => {
    git('checkout -qb docs main');
    const d = commit('README.md');
    expect(ranges(`(delete) ${Z} refs/heads/feat ${main}\n`)).toBe('');
    expect(ranges(`refs/tags/v1 ${main} refs/tags/v1 ${Z}\n`)).toBe('');
    expect(ranges(`refs/heads/docs ${d} refs/heads/docs ${main}\n`)).toBe('');
    expect(ranges('')).toBe('');
  });

  test('budgets, lockfile and config changes count as site changes', () => {
    git('checkout -qb cfg main');
    const e = commit('perf-budgets.json');
    expect(ranges(`refs/heads/cfg ${e} refs/heads/cfg ${main}\n`)).toBe(`${e} ${main}..${e}`);
  });
});

describe('a push runs the gate', () => {
  test('.githooks/pre-push exists, is executable and runs bun run perf', () => {
    const hook = '.githooks/pre-push';
    expect(statSync(hook).mode & 0o111).toBeGreaterThan(0);
    expect(readFileSync(hook, 'utf8')).toContain('bun run perf');
  });

  test('the hook measures the pushed commit in a throwaway worktree, not the working tree', () => {
    const hook = readFileSync('.githooks/pre-push', 'utf8');
    expect(hook).toContain('scripts/push-range.sh');
    expect(hook).toContain('git worktree add --detach');
    expect(hook).toMatch(/trap /);
  });

  test('the agent is read-only, bounded in turns and time, and only called when there is a report', () => {
    const hook = readFileSync('.githooks/pre-push', 'utf8');
    expect(hook).toContain('--max-turns 15');
    expect(hook).toContain('--disallowedTools="Edit,Write,NotebookEdit"');
    // --allowedTools/--disallowedTools are variadic: a space-separated value swallows a trailing
    // prompt and claude then waits on the hook's stdin until the timeout. The prompt goes first,
    // and stdin is closed so the agent never reads the pushed refs.
    expect(hook).not.toMatch(/--(dis)?allowedTools "/);
    expect(hook).toMatch(/claude -p "\$prompt" --agent perf-watchdog/);
    expect(hook).toMatch(/<\s*\/dev\/null/);
    expect(hook).toContain('Bash(git show:*)');
    expect(hook).toMatch(/180/);
    expect(hook).toMatch(/\[ -f "?\$?[^\]]*last-report\.md/);
    const agent = readFileSync('.claude/agents/perf-watchdog.md', 'utf8');
    const tools = agent.match(/^tools:(.*)$/m)![1];
    expect(tools).not.toMatch(/Bash\s*(,|$)/);
    expect(tools).toContain('Bash(git show:*)');
  });

  test('package.json points git at .githooks and defines the perf script', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    // '|| true' keeps bun install working where there is no .git (e.g. a deploy from an upload).
    expect(pkg.scripts.prepare).toStartWith('git config core.hooksPath .githooks');
    expect(pkg.scripts.perf).toBe('bun scripts/perf-check.ts');
  });
});
