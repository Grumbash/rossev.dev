// The machine-readable profile lives at /llms.txt (the llmstxt.org name). Agents and people often
// ask for /llm.txt instead and got a 404, so the singular spelling permanently redirects to it.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

describe('/llm.txt', () => {
  test('permanently redirects to /llms.txt, with no condition attached', () => {
    const rule = (vercel.redirects ?? []).find((r: { source: string }) => r.source === '/llm.txt');
    expect(rule).toBeDefined();
    expect(rule.destination).toBe('/llms.txt');
    expect(rule.statusCode ?? (rule.permanent ? 308 : 307)).toBeOneOf([301, 308]);
    expect(rule.has).toBeUndefined();
  });

  test('is not a second copy that could drift from /llms.txt', () => {
    expect(existsSync('public/llm.txt')).toBe(false);
  });
});
