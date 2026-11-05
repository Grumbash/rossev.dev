// Issue #10: in the hero's take-over, a tiny LEARNED policy keeps a toy service alive while visitors
// inject faults. It is not a copy of rules: the teacher it imitates (expert.ts) sees the hidden fault,
// the policy sees only noisy metrics, like an on-call engineer. It must beat doing nothing, match or
// beat a runbook frozen before training (rules.ts), recover within N ticks, and still fail honestly:
// with the judge off a bad deploy reaches prod, and an overload beyond capacity is a failure for everyone.
// Unit part: simulator, controllers, weights, Python/TS parity. Layout part: headless Chrome.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTS } from '../src/scripts/analytics';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { injectFault as ruleFault, START, toggleJudge } from '../src/scripts/replay/sim';
import { ACTIONS, FAULTS, OBS_P95, OBS_SIZE, createService, inject, observe, outcome, step, type Fault } from '../src/scripts/policy/service';
import { handRules } from '../src/scripts/policy/rules';
import { expert } from '../src/scripts/policy/expert';
import { act, decodePolicy, paramCount, type Policy } from '../src/scripts/policy/net';
import { evaluate, type Controller } from '../src/scripts/policy/eval';
import { buildSite } from './fixtures/build';

setDefaultTimeout(180_000);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BIN = 'public/policy/policy.bin';
const SEEDS = Array.from({ length: 100 }, (_, i) => 1000 + i);
const MAX_TICKS = 12; // recover within this many ticks of the fault
const VISITOR_FAULTS: Fault[] = ['latency', 'node_down', 'bad_deploy', 'surge'];

let policy: Policy;
const loadPolicy = () => {
  const b = readFileSync(BIN);
  return decodePolicy(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const learned: Controller = { name: 'policy', decide: (_s, obs) => act(policy, obs).action };
const rules: Controller = { name: 'rules', decide: (_s, obs) => handRules(obs) };
const noop: Controller = { name: 'noop', decide: () => ACTIONS.indexOf('noop') };
const teacher: Controller = { name: 'expert', decide: (s) => expert(s) };

describe('toy service simulator', () => {
  test('actions and faults are the agreed sets', () => {
    expect([...ACTIONS]).toEqual(['noop', 'retry', 'rollback', 'isolate', 'scale', 'block_merge', 'page_human']);
    expect([...FAULTS]).toEqual(['latency', 'node_down', 'bad_deploy', 'broken_test', 'surge']);
  });

  test('deterministic: same seed and actions, same trajectory and observations', () => {
    const run = () => {
      let s = inject(createService(7, { judge: true }), 'latency');
      const obs: number[][] = [];
      for (let i = 0; i < 20; i++) {
        obs.push([...observe(s)]);
        s = step(s, i % ACTIONS.length).state;
      }
      return obs;
    };
    expect(run()).toEqual(run());
    expect(run()[0].length).toBe(OBS_SIZE);
  });

  test('left alone without a fault it stays healthy', () => {
    let s = createService(3, { judge: true });
    for (let i = 0; i < 50; i++) s = step(s, ACTIONS.indexOf('noop')).state;
    expect(outcome(s)).toBeNull();
  });

  // On the page a visitor injects fault after fault into one running service.
  test('a second fault mid-episode starts from a clean slate: an old surge or overload does not linger', () => {
    for (const first of ['overload', 'surge'] as const) {
      let s = inject(createService(11, { judge: true }), first);
      for (let i = 0; i < 40; i++) s = step(s, expert(s)).state;
      s = inject(s, 'latency');
      for (let i = 0; i < 40 && outcome(s) !== 'recovered'; i++) s = step(s, expert(s)).state;
      expect(outcome(s)).toBe('recovered');
    }
  });

  test('injecting another fault does not silently clear a slow dependency', () => {
    let s = inject(createService(12, { judge: true }), 'latency');
    for (let i = 0; i < 4; i++) s = step(s, ACTIONS.indexOf('noop')).state;
    s = inject(s, 'broken_test');
    for (let i = 0; i < 6; i++) s = step(s, ACTIONS.indexOf('noop')).state;
    const p95 = observe(s)[OBS_P95];
    let clean = inject(createService(12, { judge: true }), 'broken_test');
    for (let i = 0; i < 10; i++) clean = step(clean, ACTIONS.indexOf('noop')).state;
    expect(p95).toBeGreaterThan(observe(clean)[OBS_P95] * 2);
  });

  test('the policy never sees the hidden fault: observations do not encode it', () => {
    const a = observe(inject(createService(5, { judge: true }), 'latency'));
    const b = observe(inject(createService(5, { judge: true }), 'node_down'));
    // same seed, different hidden faults: before any tick the symptoms have not shown yet
    expect([...a]).toEqual([...b]);
  });
});

describe('consistent with the take-over rules of #23', () => {
  test('a broken test is caught by the sandbox whoever is in charge, judge or not', () => {
    for (const c of [noop, rules, teacher])
      for (const judge of [true, false]) {
        const r = evaluate(c, 'broken_test', SEEDS.slice(0, 10), { judge });
        expect(r.outcomes.caught).toBe(10);
      }
    expect(ruleFault(START, 'test').outcome).toBe('caught');
  });

  test('a bad deploy is caught before merge with the judge on (the teacher blocks the merge)', () => {
    expect(evaluate(teacher, 'bad_deploy', SEEDS, { judge: true }).outcomes.caught).toBe(SEEDS.length);
    expect(ruleFault(START, 'logic').outcome).toBe('caught');
  });

  test('honest failure: with the judge off a bad deploy reaches prod for every controller', () => {
    for (const c of [noop, rules, teacher]) {
      const r = evaluate(c, 'bad_deploy', SEEDS.slice(0, 20), { judge: false });
      expect(r.firstOutcome.shipped).toBe(20);
    }
    expect(ruleFault(toggleJudge(START), 'logic').outcome).toBe('shipped');
  });

  test('honest failure: an overload beyond capacity fails for everyone, the teacher included', () => {
    for (const c of [noop, rules, teacher]) {
      const r = evaluate(c, 'overload', SEEDS.slice(0, 20), { judge: true });
      expect(r.outcomes.failed).toBe(20);
    }
  });
});

describe('the learned policy', () => {
  beforeAll(() => {
    policy = loadPolicy();
  });

  test('ships small: float16 weights under 5 KB, about a thousand parameters', () => {
    expect(readFileSync(BIN).length).toBeLessThan(5000);
    expect(paramCount(policy)).toBeGreaterThan(200);
    expect(paramCount(policy)).toBeLessThan(2500);
    expect(policy.inputs).toBe(OBS_SIZE);
    expect(policy.outputs).toBe(ACTIONS.length);
  });

  test('confidence is a probability distribution', () => {
    const { probs, action } = act(policy, observe(inject(createService(1, { judge: true }), 'surge')));
    expect(probs.length).toBe(ACTIONS.length);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(probs[action]).toBe(Math.max(...probs));
  });

  for (const fault of VISITOR_FAULTS.filter((f) => f !== 'bad_deploy')) {
    test(`${fault}: beats doing nothing, matches the runbook, recovers within ${MAX_TICKS} ticks`, () => {
      const p = evaluate(learned, fault, SEEDS, { judge: true });
      const r = evaluate(rules, fault, SEEDS, { judge: true });
      const n = evaluate(noop, fault, SEEDS, { judge: true });
      expect(p.recoveryRate).toBeGreaterThanOrEqual(0.9);
      expect(p.recoveryRate).toBeGreaterThanOrEqual(r.recoveryRate);
      expect(p.meanReturn).toBeGreaterThan(n.meanReturn);
      expect(p.meanTicksToRecover).toBeLessThanOrEqual(MAX_TICKS);
    });
  }

  test('bad deploy with the judge on: the policy blocks the merge', () => {
    expect(evaluate(learned, 'bad_deploy', SEEDS, { judge: true }).outcomes.caught).toBeGreaterThanOrEqual(95);
  });

  test('bad deploy with the judge off: it ships (honestly), then the policy rolls it back', () => {
    const r = evaluate(learned, 'bad_deploy', SEEDS, { judge: false });
    expect(r.firstOutcome.shipped).toBe(SEEDS.length);
    expect(r.outcomes.recovered).toBeGreaterThanOrEqual(90);
  });

  test('learning is worth it: strictly better than the runbook on at least one fault', () => {
    const better = VISITOR_FAULTS.some((f) => {
      const p = evaluate(learned, f, SEEDS, { judge: true });
      const r = evaluate(rules, f, SEEDS, { judge: true });
      return p.recoveryRate > r.recoveryRate || p.meanReturn > r.meanReturn + 1;
    });
    expect(better).toBe(true);
  });

  test('the runbook is frozen: rules.ts did not change after the first training run', () => {
    const first = execSync('git log --diff-filter=A --format=%H -- public/policy/policy.bin', { encoding: 'utf8' }).trim().split('\n').at(-1);
    if (!first) return; // not committed yet
    const touched = execSync(`git log --format=%H ${first}..HEAD -- src/scripts/policy/rules.ts`, { encoding: 'utf8' }).trim();
    expect(touched).toBe('');
  });
});

describe('Python and TypeScript agree', () => {
  test('logits on fixtures match within 1e-3, same argmax', () => {
    policy ??= loadPolicy();
    const fx: { obs: number[]; logits: number[] }[] = JSON.parse(readFileSync('tests/fixtures/policy-parity.json', 'utf8'));
    expect(fx.length).toBeGreaterThanOrEqual(16);
    for (const { obs, logits } of fx) {
      const out = act(policy, Float32Array.from(obs));
      out.logits.forEach((v, i) => expect(Math.abs(v - logits[i])).toBeLessThan(1e-3));
      expect(out.action).toBe(logits.indexOf(Math.max(...logits)));
    }
  });

  test('train.py supports cpu, mps and cuda, and the README says how to retrain', () => {
    const py = readFileSync('scripts/policy/train.py', 'utf8');
    for (const d of ['cpu', 'mps', 'cuda']) expect(py).toContain(d);
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toMatch(/scripts\/policy\/train\.py/);
    expect(readme).toMatch(/DAgger/);
  });
});

describe('page copy and analytics', () => {
  test('the label says learned, trained offline, not scripted, with the real parameter count', () => {
    policy ??= loadPolicy();
    const n = paramCount(policy);
    expect(en.topology.policyLabel(n)).toContain(n.toLocaleString('en'));
    expect(en.topology.policyLabel(n)).toMatch(/learned/i);
    expect(en.topology.policyLabel(n)).toMatch(/not scripted/i);
    expect(ru.topology.policyLabel(n)).toMatch(/[А-Яа-яЁё]/);
    expect(en.topology.toyService).toMatch(/toy/i);
  });

  test('policy outcomes credit the policy, not a judge or a person that the toy service does not have', () => {
    for (const d of [en, ru]) {
      expect(d.topology.policyCanvas.caught.length).toBeGreaterThan(10);
      expect(d.topology.policyCanvas.shipped.length).toBeGreaterThan(10);
    }
    expect(en.topology.policyCanvas.caught).toMatch(/polic/i);
    expect(en.topology.policyCanvas.shipped).not.toMatch(/person/i);
  });

  test('outcome analytics include recovered and failed', () => {
    const src = readFileSync('src/scripts/analytics.ts', 'utf8');
    expect(src).toMatch(/caught\|shipped\|recovered\|failed/);
    expect(EVENTS.topology_interact).toEqual(['action', 'outcome']);
    const row = readFileSync('README.md', 'utf8').split('\n').find((l) => l.startsWith('| `topology_interact`')) ?? '';
    for (const w of ['recovered', 'failed']) expect(row).toContain(w);
  });
});

// In a real browser: take over, pick a fault, watch the policy decide per tick.
describe.skipIf(!existsSync(CHROME))('take-over with the policy', () => {
  const pages = { en: '', ru: '' };
  const RAF = `<script>window.__raf=0;window.requestAnimationFrame=(cb)=>{window.__raf++;return setTimeout(()=>cb(performance.now()),16)};
    window.cancelAnimationFrame=(id)=>clearTimeout(id);</script>`;
  const PROBE = `<script>(async()=>{
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await document.fonts.ready; await wait(2500);
    const card = document.querySelector('.stage-iso-card');
    const $ = (s) => card.querySelector(s);
    const fetched = () => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('policy.bin'));
    const snap = () => ({ outcome: card.getAttribute('data-outcome'), action: card.getAttribute('data-policy-action'),
      confidence: card.getAttribute('data-policy-confidence'), label: $('[data-policy-label]')?.textContent.trim() ?? null,
      h: Math.round(card.getBoundingClientRect().height) });
    const out = { before: fetched().length };
    // The button only opens the menu (focus on its first item); nothing is injected until a pick.
    $('[data-sim-fault]').click(); await wait(1200);
    out.menuOnly = { action: card.getAttribute('data-policy-action'), expanded: $('[data-sim-fault]').getAttribute('aria-expanded'),
      focus: document.activeElement?.getAttribute('data-sim-fault-kind') ?? null };
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
    out.afterEscape = { expanded: $('[data-sim-fault]').getAttribute('aria-expanded'), focusOnButton: document.activeElement === $('[data-sim-fault]') };
    // A slow dependency picked on its own is judged as a slow dependency, not as a caught deploy.
    $('[data-sim-fault]').click(); await wait(300); $('[data-sim-fault-kind="latency"]').click(); await wait(8000); out.latency = snap();
    // Explore pauses the policy run: no outcome lands behind free play.
    $('[data-sim-fault]').click(); await wait(300); $('[data-sim-fault-kind="surge"]').click(); await wait(600);
    $('[data-story-explore]').click(); const o0 = card.getAttribute('data-outcome'); await wait(6000);
    out.exploreHeld = card.getAttribute('data-outcome') === o0; $('[data-story-explore]').click(); await wait(300);
    const pick = async (kind) => { $('[data-sim-fault]').click(); await wait(200); $('[data-sim-fault-kind="' + kind + '"]').click(); };
    await pick('node_down'); await wait(1500); out.during = snap(); await wait(6000); out.nodeDown = snap(); out.after = fetched().length;
    await pick('bad_deploy'); await wait(6000); out.badOn = snap();
    $('[data-sim-judge]').click(); await wait(200); await pick('bad_deploy'); await wait(9000); out.badOff = snap();
    out.sw = document.documentElement.scrollWidth;
    const pre = document.createElement('pre'); pre.id = '__probe'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
  })();</script>`;
  const FRAME = (lang: string, w: number) => `<!doctype html><body style="margin:0">
    <iframe src="${lang === 'ru' ? '/ru/' : '/'}" width="${w}" height="2400" style="border:0;display:block"></iframe>
    <script>const t=setInterval(()=>{const p=document.querySelector('iframe').contentDocument?.getElementById('__probe');
      if(p){clearInterval(t);const o=document.createElement('pre');o.id='__result';o.textContent=p.textContent;document.body.appendChild(o);}},100);</script>`;
  let server: ReturnType<typeof Bun.serve>;

  beforeAll(() => {
    buildSite();
    pages.en = readFileSync('dist/index.html', 'utf8');
    pages.ru = readFileSync('dist/ru/index.html', 'utf8');
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/frame') return new Response(FRAME(url.searchParams.get('lang') ?? 'en', Number(url.searchParams.get('w') ?? 1440)), { headers: { 'content-type': 'text/html' } });
        if (url.pathname === '/' || url.pathname === '/ru/') {
          const page = url.pathname === '/' ? pages.en : pages.ru;
          return new Response(page.replace('<head>', `<head>${RAF}`).replace('</body>', `${PROBE}</body>`), { headers: { 'content-type': 'text/html' } });
        }
        const file = Bun.file(join('dist', url.pathname));
        return (await file.exists()) ? new Response(file) : new Response('', { status: 404 });
      },
    });
  });
  afterAll(() => server?.stop(true));

  async function probe(lang: 'en' | 'ru', w: number) {
    const proc = Bun.spawn(
      [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--window-size=${Math.max(w + 40, 500)},2600`,
        '--virtual-time-budget=60000', '--dump-dom', `http://localhost:${server.port}/frame?lang=${lang}&w=${w}`],
      { stdout: 'pipe', stderr: 'ignore' },
    );
    const dom = await new Response(proc.stdout).text();
    await proc.exited;
    const json = dom.match(/<pre id="__result">([\s\S]*?)<\/pre>/)?.[1];
    expect(json).toBeDefined();
    return JSON.parse(json!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  }

  for (const [lang, w] of [['en', 1440], ['ru', 375]] as const) {
    test(`${lang} at ${w}: the policy decides per tick, recovers a node, blocks a bad deploy, ships it with the judge off`, async () => {
      const r = await probe(lang, w);
      expect(r.menuOnly).toEqual({ action: null, expanded: 'true', focus: 'latency' });
      expect(r.afterEscape).toEqual({ expanded: 'false', focusOnButton: true });
      expect(r.latency.outcome).toBe('recovered');
      expect(r.exploreHeld).toBe(true);
      expect(r.before).toBe(0); // the weights load only when a fault is injected
      expect(r.after).toBe(1);
      expect(ACTIONS as readonly string[]).toContain(r.during.action);
      expect(Number(r.during.confidence)).toBeGreaterThan(0);
      expect(Number(r.during.confidence)).toBeLessThanOrEqual(1);
      expect(r.during.label).toMatch(lang === 'en' ? /learned/i : /[А-Яа-яЁё]/);
      expect(r.nodeDown.outcome).toBe('recovered');
      expect(r.badOn.outcome).toBe('caught');
      expect(['shipped', 'recovered']).toContain(r.badOff.outcome);
      expect(r.badOff.outcome === 'caught').toBe(false);
      expect(r.sw).toBeLessThanOrEqual(w);
      if (w === 375) expect(r.nodeDown.h).toBeLessThanOrEqual(440);
    });
  }
});
