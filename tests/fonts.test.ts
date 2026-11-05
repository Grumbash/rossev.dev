// A Russian-speaking reader should see the same type voice as the English page, not the OS font:
// Syne and Space Grotesk ship no Cyrillic, so each heading/body stack needs a Cyrillic face
// scoped by unicode-range. Those faces load only when Cyrillic text renders, and are never
// preloaded, so the English first paint and the preloaded-font budget stay as they are.
// Checks the built output, not the source.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildSite } from './fixtures/build';

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

type Face = { family: string; ranges: [number, number][]; src: string };

let html = '';
let css = '';

beforeAll(() => {
  buildSite();
  html = readFileSync('dist/index.html', 'utf8');
  const astro = join('dist', '_astro');
  const files = readdirSync(astro).filter((f) => f.endsWith('.css'));
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  css = [...files.map((f) => readFileSync(join(astro, f), 'utf8')), ...inline].join('\n');
});

function faces(): Face[] {
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const body = m[1];
    const family = body.match(/font-family:\s*['"]?([^;'"]+)['"]?/)?.[1].trim() ?? '';
    const src = body.match(/src:\s*([^;]+)/)?.[1] ?? '';
    const raw = body.match(/unicode-range:\s*([^;]+)/)?.[1] ?? 'U+0-10FFFF';
    const ranges = raw.split(',').map((r) => {
      const [a, b] = r.trim().replace(/^U\+/i, '').split('-');
      return [parseInt(a, 16), parseInt(b ?? a, 16)] as [number, number];
    });
    return { family, ranges, src };
  });
}

// The families a CSS custom property lists, in order, before any generic keyword.
function stack(prop: string): string[] {
  const value = css.match(new RegExp(`${prop}:\\s*([^;}]+)`))?.[1] ?? '';
  return value.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
}

const covers = (f: Face, cp: number) => f.ranges.some(([a, b]) => cp >= a && cp <= b);
const CYRILLIC = ['Ж', 'ж', 'Ё', 'ы'].map((c) => c.codePointAt(0)!);

describe('Cyrillic in the display fonts', () => {
  for (const prop of ['--font-headline', '--font-display']) {
    test(`${prop} has a Cyrillic webfont, not the OS fallback`, () => {
      const families = stack(prop);
      expect(families.length).toBeGreaterThan(0);
      const all = faces();
      for (const cp of CYRILLIC) {
        const hit = families.find((fam) => all.some((f) => f.family === fam && covers(f, cp)));
        expect(hit, `${prop} glyph U+${cp.toString(16)}`).toBeDefined();
      }
    });
  }

  test('the Latin faces still come first, so English text keeps Syne and Space Grotesk', () => {
    expect(stack('--font-headline')[0]).toBe('Syne Variable');
    expect(stack('--font-display')[0]).toBe('Space Grotesk Variable');
  });

  test('Cyrillic faces are not preloaded', () => {
    const preloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*as="font"[^>]*>/g)].map((m) => m[0]);
    expect(preloads.length).toBeGreaterThan(0);
    for (const p of preloads) expect(p).not.toMatch(/cyrillic/i);
  });
});
