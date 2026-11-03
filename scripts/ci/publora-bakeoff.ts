// ONE-OFF, delete before merge: the model bake-off for the Publora sync, run by
// .github/workflows/publora-bakeoff.yml on the PR. It takes the two newest published LinkedIn posts
// with real text, puts each through every candidate model with the sync's own prompt, schema and
// validator, and writes EN entry + RU adaptation + the real cost (OpenRouter usage.cost) side by
// side to the Job Summary. It writes nothing to the repo; keys come only from the env and are
// redacted from every line it prints.
//
// Usage (CI): bun scripts/ci/publora-bakeoff.ts. Env: PUBLORA_API_KEY, OPENROUTER_API_KEY,
// GITHUB_STEP_SUMMARY, BAKEOFF_MODELS (optional, comma-separated).
import { appendFileSync } from 'node:fs';
import { callOpenRouter, redact } from './openrouter';
import { sanitize } from './watchdog';
import { DRAFT_SCHEMA, activityId, buildMessages, cleanSource, linkedinTargets, parseListPosts, publishedDate, validateDraft, type Target } from './publora-sync';
import POSTS from '../../src/data/posts.json';
import type { BlogPost } from '../../src/data/profile';

export const MODELS = ['deepseek/deepseek-v4.1-flash', 'mistralai/mistral-small-2603', 'qwen/qwen3.8-flash', 'anthropic/claude-haiku-5.5'];
const PUBLORA = 'https://api.publora.com/api/v1';
// Posts since 2026-10-13 from Gleb's LinkedIn export (public post ids only; the export itself stays
// out of the repo): did Publora publish each, and will the sync add it or fill its full text?
const CHECKLIST: [string, string][] = [
  ['7515722598857650176', 'Engineering management is applied systems thinking'],
  ['7516584787743227905', 'Overpromising'],
  ['7516812934384152576', 'Stop using LLMs as the most expensive…'],
  ['7517626785531011072', 'Technical seniority is dead'],
  ['7517918772553461760', 'Every engineering estimate is two things'],
  ['7517919281213333504', 'The most expensive phrase in an engineering…'],
  ['7517920896150536192', 'The new AI bottleneck'],
  ['7517921822798016512', 'God damn 5k if-else'],
  ['7519300584580087809', 'AI agents helped developers write 30% more'],
  ['7519304575242207233', "The attackers kept attacking OpenCode's…"],
  ['7520469595787304962', 'Management'],
  ['7520925644172681218', 'Agent evals (carousel)'],
  ['7521194148885073920', 'AI agent architecture (carousel)'],
  ['7521565265558462464', 'In the 1920s a Soviet filmmaker… (Kuleshov)'],
  ['7521917578601029632', "Three stories from this week's AI engineering"],
  ['7522992144504995840', 'The team behind Claude Code deletes…'],
  ['7523364618107432960', 'I got hacked'],
];
const RESPONSE_FORMAT = { type: 'json_schema', json_schema: { name: 'site_entry', strict: true, schema: DRAFT_SCHEMA } };

type Deps = { fetch: typeof fetch; log: (s: string) => void; summary: (md: string) => void };
type Result = { model: string; ok: boolean; errors: string[]; draft?: any; costUsd?: number; ms: number; tokens?: string };

const usd = (n?: number) => (typeof n === 'number' ? `$${n.toFixed(5)}` : '?');
const txt = (s: unknown, max = 3000) => sanitize(String(s ?? ''), max).replace(/\|/g, '\\|');
const quote = (s: string) => txt(s, 6000).split('\n').map((l) => `> ${l}`).join('\n');

/** The n newest published LinkedIn posts with at least 300 characters of text. */
async function pickPosts(env: Record<string, string | undefined>, deps: Deps, n = 2) {
  const get = async (path: string) => {
    const res = await deps.fetch(`${PUBLORA}${path}`, { headers: { 'x-publora-key': env.PUBLORA_API_KEY! }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Publora ${path.split('?')[0]}: HTTP ${res.status}`);
    return res.json();
  };
  const ids: string[] = [];
  for (const status of ['published', 'partially_published']) {
    for (let page = 1; page <= 10; page++) {
      const { posts, hasNextPage } = parseListPosts(await get(`/list-posts?status=${status}&platform=linkedin&page=${page}&limit=100`));
      ids.push(...posts.map((p) => p.postGroupId));
      if (!hasNextPage) break;
    }
  }
  const byId = new Map<string, Target>();
  const documents = new Set<string>(); // activity ids whose group carries a PDF (a LinkedIn carousel)
  for (const id of new Set(ids)) {
    const detail: any = await get(`/get-post/${encodeURIComponent(id)}`);
    const hasPdf = (detail?.media ?? []).some((m: any) => m?.type === 'document');
    for (const t of linkedinTargets(detail)) {
      byId.set(t.activityId, t);
      if (hasPdf) documents.add(t.activityId);
    }
  }
  const targets = [...byId.values()];
  deps.log(`bakeoff: ${ids.length} group(s), ${targets.length} published LinkedIn post(s)`);
  return { targets, documents, picked: targets
    .filter((t) => cleanSource(t.content).length >= 300)
    .sort((a, b) => (BigInt(b.activityId) > BigInt(a.activityId) ? 1 : -1))
    .slice(0, n) };
}

/** Would the sync re-import posts already on the site? Publora's URN kinds vs the ids in the site's urls. */
function checklist(targets: Target[], documents: Set<string>) {
  const inPublora = new Map(targets.map((t) => [t.activityId, t]));
  const site = new Map((POSTS as BlogPost[]).map((p) => [activityId(p.url), p]));
  const out = ['## Backfill checklist (LinkedIn export since 2026-10-13)', '', '| date | post | in Publora | on the site | the sync will |', '|---|---|---|---|---|'];
  for (const [id, label] of CHECKLIST) {
    const t = inPublora.get(id);
    const p = site.get(id);
    const len = t ? cleanSource(t.content).length : 0;
    const will = !t ? '**nothing: not in Publora**' : p ? (p.body ? 'nothing' : 'add the full text') : 'add the post';
    const pub = t ? `yes, ${len} chars${documents.has(id) ? ', PDF carousel' : ''}` : '**no**';
    out.push(`| ${publishedDate(id)} | ${txt(label, 80)} | ${pub} | ${p ? (p.body ? 'with full text' : 'brief only') : 'no'} | ${will} |`);
  }
  out.push('');
  return out.join('\n');
}

function dedupeCheck(targets: Target[]) {
  const site = (POSTS as BlogPost[]).map((p) => ({ id: activityId(p.url), date: p.published, slug: p.slug }));
  const siteIds = new Set(site.map((p) => p.id));
  const kinds: Record<string, number> = {};
  for (const t of targets) {
    const k = t.postedId.match(/^urn:li:(\w+):/)?.[1] ?? 'other';
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  const matched = targets.filter((t) => siteIds.has(t.activityId));
  const sameDay = targets.filter((t) => !siteIds.has(t.activityId) && site.some((p) => p.date === publishedDate(t.activityId)));
  const out = [
    '## Dedupe check',
    '',
    `Publora postedId kinds: ${Object.entries(kinds).map(([k, n]) => `\`${k}\` × ${n}`).join(', ') || 'none'}.`,
    `${matched.length} Publora post(s) match a site post by id (${matched.map((t) => publishedDate(t.activityId)).join(', ') || '-'}).`,
    '',
  ];
  if (sameDay.length)
    out.push(
      `**${sameDay.length} Publora post(s) share a date with a site post but not its id**: the sync would import them again unless the id kinds differ only in name.`,
      '',
      ...sameDay.map((t) => `- ${publishedDate(t.activityId)} \`${t.postedId}\` · ${txt(cleanSource(t.content).split('\n')[0], 100)}`),
      '',
    );
  else out.push('No Publora post shares a date with a site post under a different id: the dedupe holds.', '');
  return out.join('\n');
}

async function tryModel(env: Record<string, string | undefined>, deps: Deps, model: string, source: string): Promise<Result> {
  const t0 = Date.now();
  const example = (POSTS as BlogPost[]).find((p) => p.slug === 'every-engineering-estimate-is-two-things');
  try {
    const r = await callOpenRouter({
      apiKey: env.OPENROUTER_API_KEY!,
      model,
      messages: buildMessages(source, example),
      fetchImpl: deps.fetch,
      maxTokens: 4000,
      temperature: 0.2,
      responseFormat: RESPONSE_FORMAT,
      title: 'rossev.dev publora bakeoff',
      timeoutMs: 120_000,
    });
    const v = validateDraft(r.text.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/, '$1'), source);
    let draft: any;
    try {
      draft = v.ok ? v.draft : JSON.parse(r.text);
    } catch {}
    return { model, ok: v.ok, errors: v.ok ? [] : v.errors, draft, costUsd: r.costUsd, ms: Date.now() - t0 };
  } catch (e: any) {
    return { model, ok: false, errors: [`${e?.message ?? e}${e?.cause ? ` (${String(e.cause).slice(0, 200)})` : ''}`], ms: Date.now() - t0 };
  }
}

function renderPost(t: Target, source: string, results: Result[]) {
  const out = [`## ${publishedDate(t.activityId)} · ${txt(source.split('\n')[0], 120)}`, '', `<details><summary>Original (EN, ${source.length} chars)</summary>`, '', quote(source), '', '</details>', ''];
  out.push('| model | valid | cost | time |', '|---|---|---|---|');
  for (const r of results) out.push(`| \`${r.model}\` | ${r.ok ? 'yes' : `**no**: ${txt(r.errors.slice(0, 3).join('; '), 300)}`} | ${usd(r.costUsd)} | ${(r.ms / 1000).toFixed(1)}s |`);
  out.push('');
  for (const r of results) {
    const d = r.draft;
    out.push(`### \`${r.model}\` ${r.ok ? '' : '(rejected by the validator)'}`, '');
    if (!d || typeof d !== 'object') {
      out.push('_no parsable answer_', '');
      continue;
    }
    out.push(
      `slug \`${txt(d.slug, 100)}\` · ${txt(d.category, 20)} · ${txt((d.tags ?? []).join(', '), 100)}`,
      '',
      '| | EN | RU |',
      '|---|---|---|',
      `| title | ${txt(d.title?.en)} | ${txt(d.title?.ru)} |`,
      `| takeaway | ${txt(d.takeaway?.en)} | ${txt(d.takeaway?.ru)} |`,
      `| quote | ${txt(d.quote?.en)} | ${txt(d.quote?.ru)} |`,
      ...[0, 1, 2].map((i) => `| bullet ${i + 1} | ${txt(d.bullets?.en?.[i])} | ${txt(d.bullets?.ru?.[i])} |`),
      '',
      '<details><summary>RU adaptation of the full post</summary>',
      '',
      quote(String(d.bodyRu ?? '')),
      '',
      '</details>',
      '',
    );
  }
  return out.join('\n');
}

export async function run(env: Record<string, string | undefined>, deps: Deps) {
  const secrets = [env.PUBLORA_API_KEY, env.OPENROUTER_API_KEY];
  const log = (s: string) => deps.log(redact(s, secrets));
  const summary = (md: string) => deps.summary(redact(md, secrets));
  for (const k of ['PUBLORA_API_KEY', 'OPENROUTER_API_KEY']) if (!env[k]?.trim()) return log(`bakeoff: ${k} is not set`);
  const models = env.BAKEOFF_MODELS?.split(',').map((s) => s.trim()).filter(Boolean) ?? MODELS;
  try {
    const { targets, documents, picked } = await pickPosts(env, { ...deps, log });
    const dedupe = checklist(targets, documents) + '\n' + dedupeCheck(targets);
    if (!picked.length) return summary(`# Publora bake-off\n\nNo published LinkedIn post with enough text found.\n\n${dedupe}`);
    const all: Result[][] = [];
    const parts: string[] = [];
    for (const t of picked) {
      const source = cleanSource(t.content);
      const results: Result[] = [];
      for (const m of models) {
        const r = await tryModel(env, deps, m, source);
        log(`bakeoff: ${m} on ${t.activityId}: ${r.ok ? 'valid' : 'rejected'}, ${usd(r.costUsd)}, ${r.ms} ms`);
        results.push(r);
      }
      all.push(results);
      parts.push(renderPost(t, source, results));
    }
    const head = ['# Publora bake-off', '', `${picked.length} post(s) × ${models.length} model(s), the sync's own prompt, schema and validator. Cost is OpenRouter's usage.cost for that call.`, '', '| model | valid | avg cost per post |', '|---|---|---|'];
    for (const [i, m] of models.entries()) {
      const rs = all.map((r) => r[i]);
      const costs = rs.map((r) => r.costUsd).filter((c): c is number => typeof c === 'number');
      head.push(`| \`${m}\` | ${rs.filter((r) => r.ok).length}/${rs.length} | ${costs.length ? usd(costs.reduce((a, b) => a + b, 0) / costs.length) : '?'} |`);
    }
    summary([...head, '', dedupe, ...parts].join('\n') + '\n');
  } catch (e: any) {
    log(`bakeoff: ${e?.message ?? e}`);
  }
}

if (import.meta.main) {
  await run(process.env, {
    fetch,
    log: (s) => console.log(s),
    summary: (md) => (process.env.GITHUB_STEP_SUMMARY ? appendFileSync(process.env.GITHUB_STEP_SUMMARY, md) : console.log(md)),
  }).catch(() => console.log('bakeoff: unexpected error'));
  process.exit(0);
}
