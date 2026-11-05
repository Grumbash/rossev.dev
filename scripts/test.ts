// `bun run test`: the whole suite on every core. `bun test` runs the files one after another in one
// thread, and the NCA simulations alone are minutes of CPU, so this builds the site once and then
// runs each test file as its own `bun test` process, the slowest files first. Durations from the
// last run are kept in node_modules/.cache/test-times.json for that ordering.
//
// Usage: bun scripts/test.ts [files...]  (default: every tests/**/*.test.ts).
// Env: TEST_JOBS=n caps the parallel processes (default: the core count); SKIP_BUILD=1 reuses dist/.
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname } from 'node:path';

const TIMES = 'node_modules/.cache/test-times.json';

const files = process.argv.length > 2 ? process.argv.slice(2) : [...new Bun.Glob('tests/**/*.test.ts').scanSync('.')];
const jobs = Math.max(1, Number(process.env.TEST_JOBS) || availableParallelism());
const known: Record<string, number> = existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, 'utf8')) : {};
// Unknown files go by size: a long file is usually a slow one.
const cost = (f: string) => known[f] ?? statSync(f).size / 100;
files.sort((a, b) => cost(b) - cost(a));

const started = performance.now();
if (!(process.env.SKIP_BUILD && existsSync('dist/index.html'))) {
  execSync('bun run build', { stdio: 'ignore', env: { ...process.env, PUBLIC_UMAMI_WEBSITE_ID: 'test-site-id' } });
}
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
console.log(`built in ${secs(performance.now() - started)}, running ${files.length} files on ${jobs} processes`);

type Result = { file: string; ok: boolean; ms: number; output: string; counts: string };

function run(file: string): Promise<Result> {
  const t0 = performance.now();
  return new Promise((done) => {
    const child = spawn('bun', ['test', file], { env: { ...process.env, SKIP_BUILD: '1' } });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => {
      const counts = [...output.matchAll(/^\s*(\d+) (pass|fail|skip)$/gm)].map((m) => `${m[1]} ${m[2]}`).join(', ');
      done({ file, ok: code === 0, ms: performance.now() - t0, output, counts });
    });
  });
}

const queue = [...files];
const results: Result[] = [];
await Promise.all(
  Array.from({ length: Math.min(jobs, files.length) }, async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const r = await run(file);
      results.push(r);
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${secs(r.ms).padStart(6)}  ${file}  (${r.counts})`);
    }
  }),
);

const failed = results.filter((r) => !r.ok);
for (const r of failed) console.log(`\n──── ${r.file} ────\n${r.output}`);

mkdirSync(dirname(TIMES), { recursive: true });
writeFileSync(TIMES, JSON.stringify({ ...known, ...Object.fromEntries(results.map((r) => [r.file, Math.round(r.ms)])) }, null, 1));

const total = (kind: string) => results.reduce((n, r) => n + Number(r.counts.match(new RegExp(`(\\d+) ${kind}`))?.[1] ?? 0), 0);
console.log(
  `\n${total('pass')} pass, ${total('fail')} fail, ${total('skip')} skip across ${results.length} files in ${secs(performance.now() - started)}` +
    (failed.length ? `\nfailed: ${failed.map((r) => r.file).join(', ')}` : ''),
);
process.exit(failed.length ? 1 : 0);
