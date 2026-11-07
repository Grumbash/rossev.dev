// The performance gate behind `bun run perf` and the CI check on every PR. Builds the site, holds
// dist/ to the byte budgets in perf-budgets.json, then runs Lighthouse against `astro preview`
// (mobile and desktop, median of PERF_RUNS runs) and exits 1 on any breach. The full report
// goes to .perf/last-report.md, which CI posts to the job summary and the watchdog
// (scripts/ci/watchdog.ts) hands to a model on a breach.
//
// Usage: bun scripts/perf-check.ts [target dir]  (or PERF_TARGET; default: the current directory).
// Env: PERF_SKIP_LIGHTHOUSE=1 checks bytes only; PERF_RUNS=n sets Lighthouse runs (default 3).
// A failing Lighthouse form factor gets 5 more runs before it fails the gate.
import { execFileSync, execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { findChrome } from './chrome';

export type ByteBudgets = {
  htmlGzip: number;
  inlineStyle: number;
  firstPartyJsGzip: number;
  singleChunkGzip: number;
  preloadedFonts: number;
  preloadedFontCount: number;
};
export type LhThresholds = { score: number; lcp: number; cls: number; tbt: number };
export type LhBudgets = { mobile: LhThresholds; desktop: LhThresholds };

export type Check = {
  name: string;
  actual: number;
  limit: number;
  /** 'max': actual must be <= limit; 'min': actual must be >= limit (Lighthouse score). */
  kind: 'max' | 'min';
  unit: string;
  files: string[];
  ok: boolean;
};

const gz = (buf: Buffer | string) => gzipSync(buf, { level: 9 }).length;

const check = (
  name: string,
  actual: number,
  limit: number,
  unit: string,
  files: string[] = [],
  kind: 'max' | 'min' = 'max',
): Check => ({ name, actual, limit, kind, unit, files, ok: kind === 'max' ? actual <= limit : actual >= limit });

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}=["']?([^"'\\s>]+)`, 'i'))?.[1];

/** Local path inside dist for a URL the page references, or null for anything not served from dist. */
const localPath = (url: string) => (/^([a-z]+:)?\/\//i.test(url) || /^[a-z]+:/i.test(url) ? null : url.replace(/^\.?\//, '').split(/[?#]/)[0]);

/** Pure byte-budget evaluation of a built dist directory. */
export function evaluateBytes(distDir: string, b: ByteBudgets): Check[] {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const out: Check[] = [];

  out.push(check('html-gzip', gz(html), b.htmlGzip, 'B', ['index.html']));

  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('');
  out.push(check('inline-style', Buffer.byteLength(styles), b.inlineStyle, 'B', ['index.html']));

  // Scripts the page runs plus modules it preloads; external URLs are not in dist and are ignored.
  const srcs = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => attr(m[0], 'src'));
  const preloads = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => /\srel=["']?modulepreload/i.test(t))
    .map((t) => attr(t, 'href'));
  const scripts = [...new Set([...srcs, ...preloads].map((u) => (u ? localPath(u) : null)))].filter(
    (p): p is string => !!p && p.endsWith('.js') && existsSync(join(distDir, p)),
  );
  const jsGzip = scripts.reduce((sum, p) => sum + gz(readFileSync(join(distDir, p))), 0);
  out.push(check('first-party-js-gzip', jsGzip, b.firstPartyJsGzip, 'B', scripts));

  const astroDir = join(distDir, '_astro');
  const chunks = existsSync(astroDir) ? readdirSync(astroDir).filter((f) => f.endsWith('.js')) : [];
  let biggest = { file: '', size: 0 };
  const fat: string[] = [];
  for (const f of chunks) {
    const size = gz(readFileSync(join(astroDir, f)));
    if (size > biggest.size) biggest = { file: `_astro/${f}`, size };
    if (size > b.singleChunkGzip) fat.push(`_astro/${f}`);
  }
  out.push(check('single-chunk-gzip', biggest.size, b.singleChunkGzip, 'B', fat.length ? fat : biggest.file ? [biggest.file] : []));

  const fonts = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => /\srel=["']?preload/i.test(t) && /\sas=["']?font/i.test(t))
    .map((t) => localPath(attr(t, 'href') ?? ''))
    .filter((p): p is string => !!p && existsSync(join(distDir, p)));
  const fontBytes = fonts.reduce((sum, p) => sum + readFileSync(join(distDir, p)).length, 0);
  out.push(check('preloaded-fonts', fontBytes, b.preloadedFonts, 'B', fonts));
  out.push(check('preloaded-font-count', fonts.length, b.preloadedFontCount, 'files', fonts));

  // The writing index, post pages and /how-its-built/ share the home page's HTML budget, one check
  // per page (after the index.html checks); so does each page's other-locale copy under ru/.
  const pages: string[] = [];
  for (const prefix of ['', 'ru/']) {
    if (prefix && existsSync(join(distDir, prefix, 'index.html'))) pages.push(`${prefix}index.html`);
    const writingDir = join(distDir, prefix, 'writing');
    if (existsSync(join(writingDir, 'index.html'))) pages.push(`${prefix}writing/index.html`);
    if (existsSync(writingDir))
      pages.push(
        ...readdirSync(writingDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && existsSync(join(writingDir, d.name, 'index.html')))
          .map((d) => `${prefix}writing/${d.name}/index.html`)
          .sort(),
      );
    if (existsSync(join(distDir, prefix, 'how-its-built', 'index.html'))) pages.push(`${prefix}how-its-built/index.html`);
  }
  for (const p of pages) out.push(check('html-gzip', gz(readFileSync(join(distDir, p))), b.htmlGzip, 'B', [p]));

  return out;
}

/** The subset of a Lighthouse result (LHR) the gate reads. */
export type LhrLike = {
  categories: { performance: { score: number | null } };
  audits: Record<string, { numericValue?: number }>;
};

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Pure evaluation of Lighthouse runs: median per metric per form factor against thresholds. */
export function evaluateLighthouse(runs: { mobile: LhrLike[]; desktop: LhrLike[] }, t: LhBudgets): Check[] {
  const out: Check[] = [];
  for (const ff of ['mobile', 'desktop'] as const) {
    const rs = runs[ff];
    if (!rs.length) continue;
    const audit = (id: string) => median(rs.map((r) => r.audits[id]?.numericValue ?? Infinity));
    out.push(check(`${ff} score`, median(rs.map((r) => r.categories.performance.score ?? 0)), t[ff].score, '', [], 'min'));
    out.push(check(`${ff} LCP`, Math.round(audit('largest-contentful-paint')), t[ff].lcp, 'ms'));
    out.push(check(`${ff} CLS`, +audit('cumulative-layout-shift').toFixed(3), t[ff].cls, ''));
    out.push(check(`${ff} TBT`, Math.round(audit('total-blocking-time')), t[ff].tbt, 'ms'));
  }
  return out;
}

/** Form factors with at least one Lighthouse breach: the ones worth re-running. */
export const failingFormFactors = (checks: Check[]) =>
  (['mobile', 'desktop'] as const).filter((ff) => checks.some((c) => !c.ok && c.name.startsWith(`${ff} `)));

/** The last line of a run. Never reads as a full pass when Lighthouse did not run. */
export function statusLine(checks: Check[], lighthouseRan: boolean) {
  const failed = checks.filter((c) => !c.ok).length;
  if (failed) return `${failed} budget(s) breached`;
  return lighthouseRan ? 'all budgets met' : 'byte budgets met; Lighthouse NOT run';
}

const fmt = (n: number, unit: string) => `${n}${unit ? ` ${unit}` : ''}`;

/** One line per check: status, budget name, actual vs limit, files. Raw numbers, no separators. */
export function formatCheck(c: Check) {
  const op = c.kind === 'max' ? (c.ok ? '<=' : '>') : c.ok ? '>=' : '<';
  const files = c.files.length ? ` (${c.files.join(', ')})` : '';
  return `${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${fmt(c.actual, c.unit)} ${op} limit ${fmt(c.limit, c.unit)}${files}`;
}

export function table(checks: Check[]) {
  // A budget checked per file (html-gzip on each post page) names the file to tell the rows apart.
  const repeated = (c: Check) => checks.filter((x) => x.name === c.name).length > 1 && c.files.length === 1;
  const rows = [['metric', 'actual', 'budget', ''], ...checks.map((c) => [repeated(c) ? `${c.name} ${c.files[0]}` : c.name, fmt(c.actual, c.unit), `${c.kind === 'min' ? '>=' : '<='} ${fmt(c.limit, c.unit)}`, c.ok ? 'ok' : 'FAIL'])];
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => r.map((cell, i) => cell.padEnd(w[i])).join('  ').trimEnd()).join('\n');
}

// ---------------------------------------------------------------------------------------------

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });

async function waitFor(url: string, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`astro preview did not answer at ${url} within ${ms}ms`);
}

function lighthouse(url: string, desktop: boolean): LhrLike {
  const args = [url, '--only-categories=performance', '--output=json', '--output-path=stdout', '--chrome-flags=--headless=new', '--quiet'];
  if (desktop) args.push('--preset=desktop');
  const json = execFileSync(LH_BIN, args, { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(json.toString());
}

// The checker's own tools, resolved from where this script lives, so it can measure any target dir.
const ROOT = resolve(import.meta.dir, '..');
const LH_BIN = join(ROOT, 'node_modules/.bin/lighthouse');

// Redraw one status line on a terminal; in CI or a pipe, print each step on its own line.
const progress = (msg: string) =>
  process.stdout.isTTY ? process.stdout.write(`\r\x1b[K${msg}`) : msg && console.log(msg);

const errText = (e: any) =>
  (String(e?.stderr ?? '') + String(e?.stdout ?? '')).trim().split('\n').slice(-15).join('\n') || String(e?.message ?? e);

const runLine = (ff: string, i: number, r: LhrLike) => {
  const a = (id: string) => r.audits[id]?.numericValue ?? NaN;
  return `| ${ff} | ${i} | ${r.categories.performance.score} | ${Math.round(a('largest-contentful-paint'))} | ${a('cumulative-layout-shift').toFixed(3)} | ${Math.round(a('total-blocking-time'))} | ${Math.round(a('first-contentful-paint'))} |`;
};

/** "LCP 812–905 ms" style spread of each metric across one form factor's runs. */
const spread = (ff: string, rs: LhrLike[]) => {
  const range = (xs: number[], unit = '') => `${Math.min(...xs)}–${Math.max(...xs)}${unit}`;
  const a = (id: string) => rs.map((r) => Math.round(r.audits[id]?.numericValue ?? NaN));
  return `${ff} ${rs.length} runs: score ${range(rs.map((r) => r.categories.performance.score ?? 0))}, LCP ${range(a('largest-contentful-paint'), ' ms')}, TBT ${range(a('total-blocking-time'), ' ms')}, CLS ${range(rs.map((r) => +(r.audits['cumulative-layout-shift']?.numericValue ?? NaN).toFixed(3)))}`;
};

async function main() {
  const t0 = Date.now();
  // Target: the checkout to measure (default: the current directory, which is what CI measures).
  // The report always lands in .perf/ of the current directory.
  const target = resolve(process.argv[2] || process.env.PERF_TARGET || '.');
  const reportPath = resolve('.perf/last-report.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  rmSync(reportPath, { force: true });

  const checks: Check[] = [];
  const notes: string[] = [];
  const runsLog: string[] = [];
  let lighthouseRan = false;
  let preview: ChildProcess | null = null;
  const kill = () => {
    if (!preview?.pid) return;
    try {
      process.kill(-preview.pid, 'SIGTERM');
    } catch {}
    preview = null;
  };
  const onSignal = () => {
    kill();
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  let head = '';
  try {
    head = execSync('git rev-parse --short HEAD', { cwd: target, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {}
  const write = (title: string, body: string[]) => {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const report = [`# Perf report — ${title}`, '', `${new Date().toISOString()} · commit ${head || '?'} · ${secs}s · budgets: perf-budgets.json`, '', ...body].join('\n');
    writeFileSync(reportPath, report + '\n');
  };

  let stage = 'budgets';
  try {
    // The target's budgets, if it has them; otherwise the ones next to the checker.
    const budgetFile = [join(target, 'perf-budgets.json'), resolve('perf-budgets.json'), join(ROOT, 'perf-budgets.json')].find(existsSync);
    if (!budgetFile) throw new Error('perf-budgets.json not found');
    const budgets = JSON.parse(readFileSync(budgetFile, 'utf8')) as { bytes: ByteBudgets; lighthouse: LhBudgets };

    stage = 'build';
    process.stdout.write(`perf: building${target === process.cwd() ? "" : ` ${target}`}... `);
    execSync('bun run build', { cwd: target, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('done');

    stage = 'bytes';
    checks.push(...evaluateBytes(join(target, 'dist'), budgets.bytes));

    const chrome = process.env.PERF_SKIP_LIGHTHOUSE ? null : findChrome();
    if (process.env.PERF_SKIP_LIGHTHOUSE) notes.push('Lighthouse skipped (PERF_SKIP_LIGHTHOUSE=1).');
    else if (!chrome) {
      // In CI a green gate must mean Lighthouse ran: a runner image without Chrome fails loudly.
      if (process.env.CI) {
        stage = 'lighthouse';
        throw new Error('Chrome not found on the CI runner (set CHROME_PATH); refusing to skip Lighthouse');
      }
      const msg = 'Chrome not found (set CHROME_PATH); Lighthouse NOT run, byte budgets only.';
      console.warn(`perf: WARNING ${msg}`);
      notes.push(msg);
    } else {
      if (!process.env.CHROME_PATH) process.env.CHROME_PATH = chrome;
      const n = Math.max(1, Number(process.env.PERF_RUNS) || 3);

      stage = 'preview';
      const port = await freePort();
      const url = `http://127.0.0.1:${port}/`;
      preview = spawn(join(ROOT, 'node_modules/.bin/astro'), ['preview', '--ignore-lock', '--host', '127.0.0.1', '--port', String(port)], {
        cwd: target,
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
        stdio: 'ignore',
        detached: true,
      });
      await waitFor(url);

      stage = 'lighthouse';
      const runs = { mobile: [] as LhrLike[], desktop: [] as LhrLike[] };
      const measure = (ff: 'mobile' | 'desktop', count: number, label: string) => {
        for (let i = 1; i <= count; i++) {
          progress(`perf: lighthouse ${ff} ${label}${i}/${count}`);
          const r = lighthouse(url, ff === 'desktop');
          runs[ff].push(r);
          runsLog.push(runLine(ff, runs[ff].length, r));
        }
      };
      measure('mobile', n, '');
      measure('desktop', n, '');
      // Lighthouse is noisy: before failing the gate, give a failing form factor 5 more runs
      // and judge on the median of all of them.
      for (const ff of failingFormFactors(evaluateLighthouse(runs, budgets.lighthouse))) {
        progress('');
        console.log(`perf: ${ff} breached a Lighthouse budget, re-running 5 more times`);
        measure(ff, 5, 'retry ');
      }
      progress('');
      for (const ff of ['mobile', 'desktop'] as const) {
        const line = spread(ff, runs[ff]);
        console.log(`perf: ${line}`);
        notes.push(line);
      }
      checks.push(...evaluateLighthouse(runs, budgets.lighthouse));
      lighthouseRan = true;
    }
  } catch (e) {
    progress('');
    const msg = `ERROR: ${stage}: ${errText(e)}`;
    console.log(stage === 'build' ? 'failed' : '');
    console.error(`perf: ${msg}`);
    write('ERROR', [msg, '', ...(checks.length ? ['## Checks before the error', '', '```', ...checks.map(formatCheck), '```'] : [])]);
    kill();
    process.exit(1);
  } finally {
    kill();
  }

  const failed = checks.filter((c) => !c.ok);
  const status = statusLine(checks, lighthouseRan);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(table(checks));
  for (const note of notes) if (!note.includes(' runs: ')) console.log(`note: ${note}`);
  console.log(`perf: ${status} (${secs}s)`);

  write(failed.length ? 'FAIL' : status, [
    `**${status}**`,
    '',
    ...(failed.length ? ['## Breaches', '', ...failed.map((c) => `- ${formatCheck(c)}`), ''] : []),
    '## All checks',
    '',
    '```',
    ...checks.map(formatCheck),
    '```',
    '',
    ...(runsLog.length
      ? ['## Lighthouse runs (raw)', '', '| form factor | run | score | LCP ms | CLS | TBT ms | FCP ms |', '|---|---|---|---|---|---|---|', ...runsLog, '']
      : []),
    ...notes.map((n) => `Note: ${n}`),
  ]);

  process.exit(failed.length ? 1 : 0);
}

if (import.meta.main) await main();
