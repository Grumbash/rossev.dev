// ONE-OFF, delete before merge (with .github/workflows/publora-ru-sample.yml): regenerates two
// posts already on the site with the sync's new RU prompt (docs/ru-style.md) and writes the RU of
// the entry on main next to the new draft to the Job Summary. Source texts come from the backfill
// file, so only OPENROUTER_API_KEY is needed; it comes from repo secrets and is redacted from logs.
// Writes nothing to the repo.
import { appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { BlogPost } from '../../src/data/profile';
import { callOpenRouter, redact } from './openrouter';
import { DEFAULT_MODEL, RESPONSE_FORMAT, activityId, buildMessages, cleanSource, validateDraft } from './publora-sync';

// "Explanation vs Ownership" (the Title Case calque) and "AI agents helped write 30% more code".
const IDS = ['7471699825135308800', '7519300584580087809'];

const key = process.env.OPENROUTER_API_KEY?.trim();
const say = (s: string) => console.log(redact(s, [key]));
if (!key) {
  say('OPENROUTER_API_KEY is not set; nothing to do.');
  process.exit(0);
}

const onMain: BlogPost[] = JSON.parse(execSync('git show origin/main:src/data/posts.json', { encoding: 'utf8' }));
const here: BlogPost[] = JSON.parse(execSync('cat src/data/posts.json', { encoding: 'utf8' }));
const backfill: { activityId: string; text: string }[] = JSON.parse(execSync('cat src/data/linkedin-backfill.json', { encoding: 'utf8' }));
const example = here.find((p) => p.slug === 'every-engineering-estimate-is-two-things') ?? here[0];

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
const out: string[] = ['# RU adaptation: the entry on main vs the new prompt', '', `Model chain: \`${DEFAULT_MODEL}\`, temperature 0.2, the sync's own prompt, schema and validator.`, ''];
let cost = 0;

for (const id of IDS) {
  const src = backfill.find((b) => b.activityId === id);
  const cur = onMain.find((p) => activityId(p.url) === id);
  if (!src || !cur) {
    out.push(`## ${id}: not found (backfill ${!!src}, main ${!!cur})`, '');
    continue;
  }
  const source = cleanSource(src.text);
  try {
    const r = await callOpenRouter({
      apiKey: key,
      model: DEFAULT_MODEL,
      messages: buildMessages(source, example),
      maxTokens: 4000,
      temperature: 0.2,
      responseFormat: RESPONSE_FORMAT,
      title: 'rossev.dev publora ru sample',
      timeoutMs: 120_000,
    });
    cost += r.costUsd ?? 0;
    const v = validateDraft(r.text.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/, '$1'), source);
    out.push(`## ${cur.title.en}`, '', `Validator: ${v.ok ? 'ok' : 'REJECTED: ' + cell(v.errors.join('; '))}`, '');
    const d: any = v.ok ? v.draft : (() => { try { return JSON.parse(r.text); } catch { return null; } })();
    if (d) {
      out.push('| | On main | New prompt |', '|---|---|---|');
      out.push(`| title | ${cell(cur.title.ru)} | ${cell(d.title?.ru ?? '')} |`);
      out.push(`| takeaway | ${cell(cur.takeaway.ru)} | ${cell(d.takeaway?.ru ?? '')} |`);
      out.push(`| quote | ${cell(cur.brief.quote.ru)} | ${cell(d.quote?.ru ?? '')} |`);
      for (let i = 0; i < 3; i++) out.push(`| bullet ${i + 1} | ${cell(cur.brief.bullets.ru[i] ?? '')} | ${cell(d.bullets?.ru?.[i] ?? '')} |`);
      out.push('', '<details><summary>New full RU text (main has none)</summary>', '', d.bodyRu ?? '', '', '</details>', '');
    }
  } catch (e: any) {
    out.push(`## ${cur.title.en}`, '', `Call failed: ${cell(String(e?.message ?? e))}`, '');
  }
}
out.push(`Total cost: $${cost.toFixed(5)}`);

const md = redact(out.join('\n') + '\n', [key]);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
// Also in the log: the summary is not readable from the gh CLI.
console.log(md);
