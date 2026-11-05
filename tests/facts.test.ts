// What Google, answer engines and a skeptical reader see about Gleb must agree
// across the page, its JSON-LD and llms.txt. Checks the built output, not the source.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildSite } from './fixtures/build';

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

let html = '';
let llms = '';
let graph: any[] = [];

beforeAll(() => {
  buildSite();
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
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<span class="lang-ru">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
const visibleRu = () =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<span class="lang-en">[\s\S]*?<\/span>/g, '')
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

  test('the YAGNI PR count is framed as the first week, with who wrote the code and who planned it', () => {
    expect(visibleEn()).toMatch(/28 PRs\s*Merged in the first week: 98% of the code by agents, 97% of the planning by me/);
    expect(visibleEn()).not.toMatch(/first 8 days/);
  });

  test('the YAGNI card claims one agent share, 98% of the code, and drops the unprovable 89% of PRs', () => {
    for (const text of [visibleEn(), visibleRu(), llms]) {
      expect(text).not.toMatch(/89%/);
      expect(text).not.toMatch(/Of my PRs written by agents|Моих PR написали агенты/i);
    }
    const shares = [...visibleEn().matchAll(/(\d+)% of the code/g), ...visibleRu().matchAll(/(\d+)% кода/g)].map((m) => m[1]);
    expect(shares.length).toBeGreaterThan(0);
    expect(new Set(shares)).toEqual(new Set(['98']));
  });
});
