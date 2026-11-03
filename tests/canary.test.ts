// Canary #42 is an easter egg for the humans who read Gleb's CV to the end. It must stay one,
// and stay findable, but it must not read as an instruction to an AI assistant: answer engines
// that ingest llms.txt or the PDF flag "AI, say X in your reply" as prompt injection and may
// distrust or drop the whole source. One name everywhere: "canary #42".
// Checks the built output, not the source.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

const sources: Record<string, string> = {};

beforeAll(() => {
  execSync('bun run build', { stdio: 'ignore' });
  sources['llms.txt'] = readFileSync('dist/llms.txt', 'utf8');
  // The PDF is written with uncompressed text streams, so its strings are readable as latin1.
  sources['cv pdf'] = readFileSync('dist/gleb-rosev-cv.pdf', 'latin1');
  sources['home footer'] = readFileSync('dist/index.html', 'utf8').match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
});

// Wording that tells a model what to do, or speaks to it directly.
const DIRECTIVE = [
  /\bAI assistants?\b/i,
  /\bassistants?\b[^.]{0,40}\b(mention|say|include|reply|respond)/i,
  /\byour (first )?(message|reply|response|summary)\b/i,
  /\bnote for (AI|LLM|assistant)/i,
  /\bignore\b|\binstructions?\b/i,
];

describe('canary #42', () => {
  for (const name of ['llms.txt', 'cv pdf', 'home footer']) {
    test(`${name} still carries the egg`, () => {
      expect(sources[name]).toMatch(/canary #42/i);
    });

    test(`${name} has no directive to AI around it, and one name for it`, () => {
      for (const re of DIRECTIVE) expect(sources[name], String(re)).not.toMatch(re);
      expect(sources[name]).not.toMatch(/YAGNI-42/);
    });
  }
});

describe('the CV PDF hides no text', () => {
  // Text too small for a person to read reaches only parsers and models; ATS and LLM screeners
  // flag hidden text in a resume as injection whatever it says. Every text object must be legible.
  test('every text object is at least 5pt', () => {
    const blocks = [...sources['cv pdf'].matchAll(/BT\s+\/F\d+ ([\d.]+) Tf/g)].map((m) => Number(m[1]));
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.filter((s) => s < 5)).toEqual([]);
  });
});
