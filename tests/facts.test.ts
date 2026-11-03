// What Google, answer engines and a skeptical reader see about Gleb must agree
// across the page, its JSON-LD and llms.txt. Checks the built output, not the source.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

let html = '';
let llms = '';
let graph: any[] = [];

beforeAll(() => {
  execSync('bun run build', { stdio: 'ignore' });
  html = readFileSync('dist/index.html', 'utf8');
  llms = readFileSync('dist/llms.txt', 'utf8');
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}';
  const ld = JSON.parse(raw);
  graph = ld['@graph'] ?? [ld];
});

const byType = (t: string) => graph.find((n) => n['@type'] === t);
const visibleEn = () =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<span class="lang-ru">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('identity', () => {
  test('JSON-LD is a graph: ProfilePage about a Person with a stable @id', () => {
    const person = byType('Person');
    const page = byType('ProfilePage');
    expect(person?.['@id']).toBe('https://rossev.dev/#person');
    expect(page?.mainEntity?.['@id']).toBe('https://rossev.dev/#person');
    expect(byType('WebSite')).toBeDefined();
  });

  test('the Person carries both spellings, a url, an image and what he knows', () => {
    const person = byType('Person');
    expect(person.alternateName).toContain('Gleb Rossev');
    expect(person.url).toBe('https://rossev.dev/');
    expect(person.image).toMatch(/^https:\/\/rossev\.dev\//);
    expect(person.knowsAbout?.length).toBeGreaterThan(3);
    expect(person.alumniOf?.name).toBe('Belarusian State University');
  });

  test('the page says once, in plain words, who he is and how else his name is spelled', () => {
    expect(visibleEn()).toMatch(/Gleb Rosev \(also spelled Rossev\) is a Founding Engineer at YAGNI/);
  });

  test('llms.txt opens with the same third-person sentence', () => {
    const line = llms.split('\n').find((l) => l.startsWith('Gleb Rosev (also spelled Rossev) is'));
    expect(line).toBeDefined();
    expect(llms.indexOf(line!)).toBeLessThan(400);
  });
});

describe('facts agree everywhere', () => {
  test('the Kingpin -80% is called feedback analysis time, never triage', () => {
    for (const text of [visibleEn(), llms]) expect(text).not.toMatch(/triage time/i);
    expect(visibleEn()).toMatch(/-80%\s*Feedback analysis time/i);
  });

  test('the YAGNI PR count is framed as the first week, not 8 days', () => {
    expect(visibleEn()).toMatch(/28 PRs\s*Merged in the first week, almost all built by agents/);
    expect(visibleEn()).not.toMatch(/first 8 days/);
  });
});
