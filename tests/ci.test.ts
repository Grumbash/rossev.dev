// The perf gate runs in GitHub Actions on every PR (.github/workflows/perf.yml), not in a
// pre-push hook. On a breach the watchdog (scripts/ci/watchdog.ts) asks a model on OpenRouter
// what grew and how to fix it, and keeps ONE sticky PR comment up to date. The repo is public:
// the diff is untrusted input, so the model gets no tools, its answer is rendered as inert
// text, the job has minimal permissions, and the key is read only from the repo secret.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  MARKER,
  buildMessages,
  callOpenRouter,
  commentBody,
  filterDiff,
  findSticky,
  run,
  sanitize,
  stickyRequest,
} from '../scripts/ci/watchdog';

const fileDiff = (path: string, body: string) =>
  `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${body}\n`;
const binDiff = (path: string) =>
  `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\nBinary files a/${path} and b/${path} differ\n`;

const REPORT = [
  '# Perf report — 1 budget(s) breached',
  '',
  '2026-11-04T00:00:00.000Z · commit abc1234 · 61.0s · budgets: perf-budgets.json',
  '',
  '```',
  'metric               actual    budget       ',
  'html-gzip            37100 B   <= 36000 B   FAIL',
  'first-party-js-gzip  12000 B   <= 40000 B   ok',
  '```',
].join('\n');

describe('the diff the model sees', () => {
  const diff = [
    fileDiff('src/pages/index.astro', '+<section class="lang-en">hi</section>'),
    fileDiff('bun.lock', '+"left-pad": "1.0.0"'),
    binDiff('public/nca/gr.bin'),
    fileDiff('public/llms.txt', '+generated'),
    binDiff('public/gleb-rosev-cv.pdf'),
    binDiff('public/og.png'),
    fileDiff('src/styles/x.css', '+a{color:red}'),
  ].join('');

  test('drops lockfiles, binaries and generated files, keeps source', () => {
    const { text, dropped } = filterDiff(diff);
    expect(text).toContain('src/pages/index.astro');
    expect(text).toContain('src/styles/x.css');
    for (const f of ['bun.lock', 'public/nca/gr.bin', 'public/llms.txt', 'public/gleb-rosev-cv.pdf', 'public/og.png']) {
      expect(text).not.toContain(f);
      expect(dropped).toContain(f);
    }
  });

  test('is capped in size and says it was cut', () => {
    const huge = fileDiff('src/a.ts', '+' + 'x'.repeat(200_000)) + fileDiff('src/b.ts', '+b');
    const { text, truncated } = filterDiff(huge, 10_000);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(10_500);
    expect(truncated).toBe(true);
    expect(text).toMatch(/truncated/i);
  });
});

describe('the model answer is rendered as inert text', () => {
  test('no @mentions survive', () => {
    const out = sanitize('blame @Grumbash and @github/team, cc @octocat.');
    expect(out).not.toMatch(/(^|[^\w`])@[A-Za-z0-9]/);
    expect(out).toContain('Grumbash');
  });

  test('no raw HTML, images or links', () => {
    const out = sanitize(
      'a <img src=x onerror=alert(1)> b <script>x()</script> ![p](https://evil.example/p.png) [click](https://evil.example) <!-- rossev-perf-watchdog --> <details>d</details>',
    );
    expect(out).not.toMatch(/<[a-z!\/]/i);
    expect(out).not.toContain('evil.example');
    expect(out).not.toContain('](');
    expect(out).toContain('click');
  });

  test('no issue or cross-repo references that would ping other threads', () => {
    const out = sanitize('see #12 and octo/repo#3 and GH-4');
    expect(out).not.toMatch(/(^|\s|\w)#\d/);
  });

  test('headings from the model are demoted, so it cannot print a fake status line', () => {
    const out = sanitize('### Perf gate: all budgets met\n# ok');
    expect(out).not.toMatch(/^\s{0,3}#/m);
    expect(out).toContain('all budgets met');
  });

  test('length is capped', () => {
    expect(sanitize('y'.repeat(50_000)).length).toBeLessThanOrEqual(4_100);
  });

  test('plain markdown (lists, code, bold) survives', () => {
    const out = sanitize('- **html-gzip** вырос: `Hero.astro`\n- вынеси SVG');
    expect(out).toContain('**html-gzip**');
    expect(out).toContain('`Hero.astro`');
  });
});

describe('one sticky comment, updated in place', () => {
  const bot = { login: 'github-actions[bot]' };
  test('finds the bot comment with the marker, ignores anyone else quoting it', () => {
    const comments = [
      { id: 1, body: `quoting ${MARKER}`, user: { login: 'Grumbash' } },
      { id: 2, body: 'unrelated', user: bot },
      { id: 3, body: `${MARKER}\nold`, user: bot },
    ];
    expect(findSticky(comments)).toBe(3);
    expect(findSticky([comments[0], comments[1]])).toBeNull();
  });

  test('PATCHes the existing comment, POSTs a new one otherwise', () => {
    expect(stickyRequest('Grumbash/rossev.dev', 7, 3, 'b')).toEqual({ method: 'PATCH', path: '/repos/Grumbash/rossev.dev/issues/comments/3', body: { body: 'b' } });
    expect(stickyRequest('Grumbash/rossev.dev', 7, null, 'b')).toEqual({ method: 'POST', path: '/repos/Grumbash/rossev.dev/issues/7/comments', body: { body: 'b' } });
  });

  test('every body carries the marker; green is a short table, red carries the diagnosis', () => {
    const green = commentBody({ ok: true, report: REPORT.replace('FAIL', 'ok') });
    expect(green).toContain(MARKER);
    expect(green).toContain('html-gzip');
    expect(green).not.toMatch(/watchdog unavailable/i);

    const red = commentBody({ ok: false, report: REPORT, explanation: 'Вырос Hero.astro', model: 'anthropic/claude-haiku-5.5', costUsd: 0.0012 });
    expect(red).toContain(MARKER);
    expect(red).toContain('FAIL');
    expect(red).toContain('Вырос Hero.astro');
    expect(red).toContain('anthropic/claude-haiku-5.5');
    expect(red).toContain('0.0012');

    const down = commentBody({ ok: false, report: REPORT, unavailable: 'HTTP 500' });
    expect(down).toMatch(/watchdog unavailable/i);
    expect(down).toContain('FAIL');
  });
});

describe('the prompt', () => {
  const messages = buildMessages({ report: REPORT, diffStat: ' src/pages/index.astro | 2 +-', diff: filterDiff(fileDiff('src/pages/index.astro', '+x') + binDiff('public/nca/gr.bin')).text });

  test('a system prompt with the watchdog rules, then the untrusted data fenced as data', () => {
    expect(messages[0].role).toBe('system');
    const sys = messages[0].content;
    // The comment is public GitHub text: English, whatever language the diff or report is in.
    expect(sys).toMatch(/Answer in English/);
    expect(sys).not.toMatch(/Russian/i);
    expect(sys).toMatch(/budget/i);
    expect(sys).toMatch(/untrusted|data, not instructions/i);
    const user = messages.map((m) => m.content).slice(1).join('\n');
    expect(user).toContain('html-gzip');
    expect(user).toContain('src/pages/index.astro');
    expect(user).not.toContain('gr.bin');
  });

  test('the repo conventions the fix must respect are in the prompt', () => {
    const all = messages.map((m) => m.content).join('\n');
    expect(all).toContain('perf-budgets.json');
    // Bilingual copy: one locale per URL, UI strings in the typed dictionaries.
    expect(all).toMatch(/src\/i18n\/en\.ts/);
  });
});

describe('the OpenRouter call', () => {
  test('bounded output, no tools, key only in the Authorization header, cost and answering model from the response', async () => {
    let req: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      req = { url, init };
      return new Response(JSON.stringify({ model: 'z-ai/glm-5.3-flash', choices: [{ message: { content: 'ответ' } }], usage: { cost: 0.0011 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await callOpenRouter({ apiKey: 'sk-test-123', model: 'nvidia/nemotron-3-ultra-550b-a55b:free, z-ai/glm-5.3-flash', messages: [{ role: 'user', content: 'x' }], fetchImpl });
    expect(out).toEqual({ text: 'ответ', costUsd: 0.0011, model: 'z-ai/glm-5.3-flash' });
    expect(req!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = new Headers(req!.init.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-test-123');
    const body = JSON.parse(String(req!.init.body));
    // A comma-separated WATCHDOG_MODEL is an OpenRouter fallback chain: first is primary.
    expect(body.model).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(body.models).toEqual(['nvidia/nemotron-3-ultra-550b-a55b:free', 'z-ai/glm-5.3-flash']);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.max_tokens).toBeLessThanOrEqual(1500);
    // Reasoning models must not spend the whole output budget thinking.
    expect(body.reasoning).toEqual({ effort: 'low', exclude: true });
    expect(body.tools).toBeUndefined();
    expect(String(req!.init.body)).not.toContain('sk-test-123');
  });

  test('a single model is sent without a fallback list', async () => {
    let body: any;
    const fetchImpl = (async (_: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await callOpenRouter({ apiKey: 'k-1234', model: 'z-ai/glm-5.3-flash', messages: [], fetchImpl });
    expect(body.model).toBe('z-ai/glm-5.3-flash');
    expect(body.models).toBeUndefined();
    expect(out.model).toBe('z-ai/glm-5.3-flash');
  });

  test('a reasoning model that used the whole budget thinking (empty content) is an error, not an empty comment', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '', reasoning: 'hmm...' }, finish_reason: 'length' }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(callOpenRouter({ apiKey: 'k-1234', model: 'm', messages: [], fetchImpl })).rejects.toThrow();
  });

  test('an HTTP error throws without echoing the key', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const err = await callOpenRouter({ apiKey: 'sk-test-123', model: 'm', messages: [], fetchImpl }).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).not.toContain('sk-test-123');
  });
});

describe('a CI run end to end, with GitHub and OpenRouter mocked', () => {
  type Call = { url: string; method: string; body: any; auth: string | null };
  const harness = (opts: { openrouter?: 'ok' | 'fail'; existing?: number | null } = {}) => {
    const calls: Call[] = [];
    const logs: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init.headers).get('authorization') });
      if (url.startsWith('https://openrouter.ai')) {
        if (opts.openrouter === 'fail') return new Response('nope', { status: 503 });
        return new Response(JSON.stringify({ model: 'z-ai/glm-5.3-flash', choices: [{ message: { content: 'Вырос `Hero.astro`, cc @Grumbash ![x](https://evil.example/a.png)' } }], usage: { cost: 0.0009 } }), { status: 200 });
      }
      if (method === 'GET') {
        const list = opts.existing ? [{ id: opts.existing, body: `${MARKER}\nold`, user: { login: 'github-actions[bot]' } }] : [];
        return new Response(JSON.stringify(list), { status: 200 });
      }
      return new Response('{}', { status: 201 });
    }) as unknown as typeof fetch;
    const deps = {
      fetch: fetchImpl,
      exec: (args: string[]) => (args.includes('--stat') ? ' src/components/Hero.astro | 40 +' : fileDiff('src/components/Hero.astro', '+<svg/>') + binDiff('public/nca/gr.bin')),
      readFile: () => REPORT,
      log: (s: string) => logs.push(s),
    };
    const env = {
      PERF_OUTCOME: 'failure',
      PERF_REPORT: '.perf/last-report.md',
      GITHUB_REPOSITORY: 'Grumbash/rossev.dev',
      PR_NUMBER: '7',
      BASE_SHA: 'aaaaaaa',
      HEAD_SHA: 'bbbbbbb',
      IS_FORK: 'false',
      GITHUB_TOKEN: 'ghs-test-token',
      OPENROUTER_API_KEY: 'sk-or-test-secret',
      WATCHDOG_MODEL: '',
    };
    return { calls, logs, deps, env };
  };
  const posted = (calls: Call[]) => calls.filter((c) => c.url.startsWith('https://api.github.com') && c.method !== 'GET');

  test('a breach: one model call with the default model, one sanitised sticky comment, no secret in logs', async () => {
    const h = harness();
    await run(h.env, h.deps);
    const or = h.calls.filter((c) => c.url.startsWith('https://openrouter.ai'));
    expect(or).toHaveLength(1);
    expect(or[0].body.model).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(or[0].body.models).toEqual(['nvidia/nemotron-3-ultra-550b-a55b:free', 'z-ai/glm-5.3-flash']);
    expect(JSON.stringify(or[0].body)).not.toContain('gr.bin');
    const [c] = posted(h.calls);
    expect(c.method).toBe('POST');
    expect(c.url).toBe('https://api.github.com/repos/Grumbash/rossev.dev/issues/7/comments');
    expect(c.auth).toBe('Bearer ghs-test-token');
    expect(c.body.body).toContain(MARKER);
    expect(c.body.body).toContain('Hero.astro');
    // The comment names the model that actually answered, not the requested chain.
    expect(c.body.body).toContain('z-ai/glm-5.3-flash');
    expect(c.body.body).not.toContain('nemotron');
    expect(c.body.body).not.toMatch(/(^|[^\w`])@Grumbash/);
    expect(c.body.body).not.toContain('evil.example');
    expect(h.logs.join('\n')).not.toContain('sk-or-test-secret');
    expect(h.logs.join('\n')).not.toContain('ghs-test-token');
  });

  test('WATCHDOG_MODEL overrides the default', async () => {
    const h = harness();
    await run({ ...h.env, WATCHDOG_MODEL: 'google/gemini-3.8-flash' }, h.deps);
    expect(h.calls.find((c) => c.url.startsWith('https://openrouter.ai'))!.body.model).toBe('google/gemini-3.8-flash');
  });

  test('green: no model call, the existing sticky comment is PATCHed to a table', async () => {
    const h = harness({ existing: 42 });
    await run({ ...h.env, PERF_OUTCOME: 'success' }, h.deps);
    expect(h.calls.some((c) => c.url.startsWith('https://openrouter.ai'))).toBe(false);
    const [c] = posted(h.calls);
    expect(c.method).toBe('PATCH');
    expect(c.url).toBe('https://api.github.com/repos/Grumbash/rossev.dev/issues/comments/42');
  });

  test('OpenRouter down or no key: the comment says the watchdog is unavailable, run() does not throw', async () => {
    for (const env of [{ openrouter: 'fail' as const }, { key: '' }]) {
      const h = harness({ openrouter: 'openrouter' in env ? env.openrouter : 'ok' });
      await run({ ...h.env, ...('key' in env ? { OPENROUTER_API_KEY: env.key } : {}) }, h.deps);
      const [c] = posted(h.calls);
      expect(c.body.body).toMatch(/watchdog unavailable/i);
      expect(c.body.body).toContain('FAIL');
    }
  });

  test('a cancelled run (superseded by a newer push): no model call, no comment', async () => {
    const h = harness();
    await run({ ...h.env, PERF_OUTCOME: 'cancelled' }, h.deps);
    expect(h.calls).toHaveLength(0);
  });

  test('tests failed so the gate was skipped: no model call, the comment says the gate did not run', async () => {
    const h = harness({ existing: 42 });
    await run({ ...h.env, PERF_OUTCOME: 'skipped' }, h.deps);
    expect(h.calls.some((c) => c.url.startsWith('https://openrouter.ai'))).toBe(false);
    const [c] = posted(h.calls);
    expect(c.method).toBe('PATCH');
    expect(c.body.body).toContain(MARKER);
    expect(c.body.body).toMatch(/not run/i);
    expect(c.body.body).not.toMatch(/budgets met/i);
  });

  test('a fork PR: nothing is called, a neutral note is logged', async () => {
    const h = harness();
    await run({ ...h.env, IS_FORK: 'true', OPENROUTER_API_KEY: '', GITHUB_TOKEN: 'ghs-test-token' }, h.deps);
    expect(h.calls).toHaveLength(0);
    expect(h.logs.join('\n')).toMatch(/fork/i);
  });

  test('GitHub refusing the comment does not throw', async () => {
    const h = harness();
    const failing = (async (url: string, init: RequestInit = {}) =>
      url.startsWith('https://api.github.com') ? new Response('forbidden', { status: 403 }) : h.deps.fetch(url, init)) as unknown as typeof fetch;
    await expect(run(h.env, { ...h.deps, fetch: failing })).resolves.toBeDefined();
  });
});

describe('.github/workflows/perf.yml', () => {
  const path = '.github/workflows/perf.yml';
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const wf = raw ? (Bun.YAML.parse(raw) as any) : {};
  const on = wf.on ?? wf[true as any] ?? {};
  const jobs = Object.values(wf.jobs ?? {}) as any[];
  const steps = jobs.flatMap((j) => j.steps ?? []) as any[];

  test('exists and runs on pull_request, never pull_request_target', () => {
    expect(raw).not.toBe('');
    expect(Object.keys(on)).toContain('pull_request');
    expect(raw).not.toContain('pull_request_target');
    for (const k of Object.keys(on)) expect(['pull_request', 'workflow_dispatch']).toContain(k);
  });

  test('skips docs-only PRs but covers everything that ships', () => {
    const paths: string[] = on.pull_request.paths ?? [];
    for (const p of ['src/**', 'public/**', 'scripts/**', 'perf-budgets.json', 'package.json', 'bun.lock']) expect(paths).toContain(p);
  });

  test('minimal permissions, nowhere widened', () => {
    expect(wf.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    for (const j of jobs) if (j.permissions) expect(j.permissions).toEqual(wf.permissions);
  });

  test('the only secrets are OPENROUTER_API_KEY and GITHUB_TOKEN, passed as env, never inlined in a script', () => {
    const secrets = [...raw.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    expect(secrets).toContain('OPENROUTER_API_KEY');
    for (const s of secrets) expect(['OPENROUTER_API_KEY', 'GITHUB_TOKEN']).toContain(s);
    for (const s of steps) if (s.run) expect(String(s.run)).not.toContain('secrets.');
    // Untrusted PR text never interpolated into a shell script.
    for (const s of steps) if (s.run) expect(String(s.run)).not.toMatch(/github\.event\.pull_request\.(title|body|head\.ref)/);
  });

  test('every action is pinned to a full commit SHA', () => {
    const uses = steps.filter((s) => s.uses).map((s) => String(s.uses));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
  });

  test('tests, then the gate; the watchdog always reports; a breach fails the job', () => {
    const runs = steps.map((s) => String(s.run ?? ''));
    const iTest = runs.findIndex((r) => /\bbun (run )?test\b/.test(r));
    const iPerf = steps.findIndex((s) => s.id === 'perf');
    expect(iTest).toBeGreaterThanOrEqual(0);
    expect(iPerf).toBeGreaterThan(iTest);
    expect(runs[iPerf]).toContain('bun run perf');
    expect(steps[iPerf]['continue-on-error']).toBe(true);
    expect(raw).toContain('GITHUB_STEP_SUMMARY');
    const iDog = runs.findIndex((r) => r.includes('scripts/ci/watchdog.ts'));
    expect(iDog).toBeGreaterThan(iPerf);
    // Runs after a test failure too (to say the gate did not run), never for a cancelled run.
    expect(String(steps[iDog].if ?? '')).toContain('!cancelled()');
    expect(String(steps[iDog].if ?? '')).not.toContain('always()');
    const iGate = steps.findIndex((s, i) => i > iDog && /steps\.perf\.outcome\s*==\s*'failure'/.test(String(s.if ?? '')) && /exit 1/.test(String(s.run ?? '')));
    expect(iGate).toBeGreaterThan(iDog);
  });

  test("Chrome can start on ubuntu-latest: AppArmor's userns restriction is lifted before the gate, Chrome's own sandbox stays on", () => {
    const runs = steps.map((s) => String(s.run ?? ''));
    const iUserns = runs.findIndex((r) => r.includes('kernel.apparmor_restrict_unprivileged_userns=0'));
    const iPerf = steps.findIndex((s) => s.id === 'perf');
    expect(iUserns).toBeGreaterThanOrEqual(0);
    expect(iUserns).toBeLessThan(iPerf);
    expect(raw).not.toContain('--no-sandbox');
    expect(readFileSync('scripts/perf-check.ts', 'utf8')).not.toContain('--no-sandbox');
  });

  test('the browser tests run in CI: the userns lift comes before the test step, and every browser test finds Chrome through scripts/chrome.ts', () => {
    const runs = steps.map((s) => String(s.run ?? ''));
    const iUserns = runs.findIndex((r) => r.includes('kernel.apparmor_restrict_unprivileged_userns=0'));
    const iTest = runs.findIndex((r) => /\bbun (run )?test\b/.test(r));
    expect(iUserns).toBeGreaterThanOrEqual(0);
    expect(iUserns).toBeLessThan(iTest);
    expect(readFileSync('scripts/perf-check.ts', 'utf8')).toMatch(/import \{ findChrome \} from '\.\/chrome'/);
    expect(readFileSync('tests/fixtures/probe.ts', 'utf8')).toContain('findChrome()');
    for (const f of [...new Bun.Glob('tests/**/*.ts').scanSync('.')].filter((f) => f !== 'tests/ci.test.ts')) {
      const src = readFileSync(f, 'utf8');
      // Only the macOS path, and the suite skips every browser test on ubuntu-latest.
      expect({ f, hardcoded: src.includes('/Applications/Google Chrome.app') }).toEqual({ f, hardcoded: false });
      expect({ f, noSandbox: src.includes('--no-sandbox') }).toEqual({ f, noSandbox: false });
    }
  });

  test('in CI a missing Chrome fails the browser tests instead of silently skipping them', () => {
    expect(readFileSync('tests/fixtures/probe.ts', 'utf8')).toMatch(/process\.env\.CI[\s\S]{0,200}throw new Error\([^)]*Chrome/);
  });

  test('forks are told apart, runs are bounded and superseded runs cancelled', () => {
    expect(raw).toContain('github.event.pull_request.head.repo.full_name');
    expect(wf.concurrency?.['cancel-in-progress']).toBe(true);
    for (const j of jobs) expect(j['timeout-minutes']).toBeLessThanOrEqual(20);
  });

  test('in CI a missing Chrome fails the gate instead of silently skipping Lighthouse', () => {
    expect(readFileSync('scripts/perf-check.ts', 'utf8')).toMatch(/process\.env\.CI[\s\S]{0,200}throw new Error\([^)]*Chrome/);
  });

  test('there is no CI judge: the LLM review stays local', () => {
    expect(existsSync('.github/workflows/judge.yml')).toBe(false);
  });
});

describe('the gate moved from pre-push to CI', () => {
  test('no pre-push hook, no push-range script, no local watchdog agent', () => {
    expect(existsSync('.githooks/pre-push')).toBe(false);
    expect(existsSync('scripts/push-range.sh')).toBe(false);
  });

  test('package.json no longer wires git hooks, bun run perf still works by hand', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(String(pkg.scripts.prepare ?? '')).not.toContain('githooks');
    expect(pkg.scripts.perf).toBe('bun scripts/perf-check.ts');
  });

  test('README documents the CI: what runs, the model variable, cost, key rotation', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toMatch(/^## CI$/m);
    expect(readme).toContain('OPENROUTER_API_KEY');
    expect(readme).toContain('WATCHDOG_MODEL');
    expect(readme).toContain('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(readme).toMatch(/rotat/i);
    expect(readme).not.toMatch(/There's no CI/);
    expect(readme).not.toContain('pre-push');
  });
});

// The bot PAT (PUBLORA_SYNC_TOKEN) can write this repo. A job that installs or runs the lockfile's
// packages may run a compromised one, and with passwordless sudo on the runner that code owns the
// whole VM (git, gh, hooks). So the PAT lives only in jobs that run no package code at all, on a
// fresh VM, and the GITHUB_TOKEN never gets contents: write.
describe('every workflow keeps the write token away from package code', () => {
  const dir = '.github/workflows';
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const parse = (f: string) => Bun.YAML.parse(readFileSync(`${dir}/${f}`, 'utf8')) as any;
  const PACKAGE_CODE = /\b(bun|bunx|npm|npx|node|yarn|pnpm)\b/;
  const SAFE_USES = /^actions\/(checkout|download-artifact)@[0-9a-f]{40}$/;

  test('there are workflows to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    const wf = parse(f);
    const jobs = Object.entries(wf.jobs ?? {}) as [string, any][];

    test(`${f}: a job with PUBLORA_SYNC_TOKEN runs no package code and uses only checkout and download-artifact`, () => {
      for (const [, job] of jobs) {
        if (!JSON.stringify(job).includes('secrets.PUBLORA_SYNC_TOKEN')) continue;
        for (const s of job.steps ?? []) {
          if (s.run) expect(String(s.run)).not.toMatch(PACKAGE_CODE);
          if (s.uses) expect(String(s.uses)).toMatch(SAFE_USES);
        }
      }
    });

    test(`${f}: the PAT never reaches every job at once (workflow env, secrets: inherit)`, () => {
      expect(JSON.stringify(wf.env ?? {})).not.toContain('PUBLORA_SYNC_TOKEN');
      for (const [, job] of jobs) expect(job.secrets).not.toBe('inherit');
    });

    test(`${f}: the GITHUB_TOKEN never gets contents: write`, () => {
      expect(wf.permissions).toBeDefined();
      for (const p of [wf.permissions, ...jobs.map(([, j]) => j.permissions)]) {
        if (p && typeof p === 'object') expect(p.contents).not.toBe('write');
        expect(p).not.toBe('write-all');
      }
    });
  }
});
