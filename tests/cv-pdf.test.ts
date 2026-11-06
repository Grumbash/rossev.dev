// The CV PDF is what a recruiter downloads and what an ATS parses: two clean pages, every role,
// the stack and education present, no line drawn over another, the canary strip in its own band,
// real typography (no "--" dashes, no ">" bullets) and text that extracts in reading order.
// Parses the generated file itself: pages, text objects with font size and position, filled rects.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CAPABILITIES, EXPERIENCE, PROFILE } from '../src/data/profile';

setDefaultTimeout(60_000);

interface TextObj {
  font: string;
  size: number;
  x: number;
  y: number;
  text: string;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Page {
  texts: TextObj[];
  rects: Rect[];
}

// WinAnsi bytes above ASCII that the CV may use.
const WIN_ANSI: Record<number, string> = { 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0xb7: '·' };

function decodeString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    let c = raw[i];
    if (c === '\\') {
      const n = raw[++i];
      if (/[0-7]/.test(n)) {
        let oct = n;
        while (oct.length < 3 && /[0-7]/.test(raw[i + 1])) oct += raw[++i];
        c = String.fromCharCode(parseInt(oct, 8));
      } else c = ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[n] ?? n;
    }
    const code = c.charCodeAt(0);
    out += WIN_ANSI[code] ?? c;
  }
  return out;
}

function parsePdf(pdf: string): Page[] {
  const objects = new Map<number, string>();
  for (const m of pdf.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objects.set(Number(m[1]), m[2]);
  const pagesObj = [...objects.values()].find((o) => /\/Type \/Pages\b/.test(o)) ?? '';
  const kids = [...(pagesObj.match(/\/Kids \[([^\]]*)\]/)?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  return kids.map((id) => {
    const page = objects.get(id) ?? '';
    const contentIds = [...(page.match(/\/Contents (\[[^\]]*\]|\d+ 0 R)/)?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
    const stream = contentIds.map((cid) => objects.get(cid)?.match(/stream\n([\s\S]*?)\nendstream/)?.[1] ?? '').join('\n');
    const texts: TextObj[] = [];
    // BT and ET are operators on their own lines, so a string holding "ET" can't end a block early.
    for (const bt of stream.matchAll(/^BT$([\s\S]*?)^ET$/gm)) {
      const body = bt[1];
      const font = body.match(/\/(F\d+) ([\d.]+) Tf/);
      const pos = body.match(/([\d.-]+) ([\d.-]+) Td/) ?? body.match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/);
      const strings = [...body.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => decodeString(m[1]));
      // A text object the parser can't read would escape every check below, so it fails instead.
      if (!font || !pos || strings.length === 0) throw new Error(`unparsed text object: ${body}`);
      texts.push({ font: font[1], size: Number(font[2]), x: Number(pos[1]), y: Number(pos[2]), text: strings.join('') });
    }
    const rects = [...stream.matchAll(/([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re f\b/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      w: Number(m[3]),
      h: Number(m[4]),
    }));
    return { texts, rects };
  });
}

// Words only, so wrapping, dashes and bullets don't matter when checking that content is present.
// Arrows have no WinAnsi glyph, so the CV spells "15s → 0s" as "15s to 0s".
const words = (s: string) =>
  s
    .replace(/→/g, ' to ')
    .toLowerCase()
    .match(/[a-z0-9+#%$]+/g)
    ?.join(' ') ?? '';

let pages: Page[] = [];
let fullText = '';

beforeAll(() => {
  execSync('bun scripts/generate-cv-and-og.ts', { stdio: 'ignore' });
  pages = parsePdf(readFileSync('public/gleb-rosev-cv.pdf', 'latin1'));
  fullText = pages.map((p) => p.texts.map((t) => t.text).join('\n')).join('\n');
});

// The dark strip at the bottom of a page that holds the footer text.
const footerBand = (page: Page) =>
  page.rects
    .filter((r) => r.y < 80 && r.w > 300 && r.h < 60)
    .find((r) => page.texts.some((t) => t.y > r.y && t.y < r.y + r.h));

describe('CV PDF layout', () => {
  test('has exactly 2 pages, and the second carries real content', () => {
    expect(pages.length).toBe(2);
    const band = footerBand(pages[1]);
    const body = pages[1].texts.filter((t) => !band || t.y > band.y + band.h);
    expect(body.length).toBeGreaterThan(10);
  });

  test('every experience entry is present: role, company and every highlight', () => {
    const all = words(fullText);
    for (const exp of EXPERIENCE) {
      expect(all, exp.company).toContain(words(exp.role.en));
      expect(all, exp.company).toContain(words(exp.company));
      for (const h of exp.highlights.en) expect(all, h).toContain(words(h));
    }
  });

  test('capabilities and Education & Languages are present', () => {
    const all = words(fullText);
    for (const cap of CAPABILITIES) {
      expect(all).toContain(words(cap.title.en));
      for (const skill of cap.skills) expect(all, skill).toContain(words(skill));
    }
    expect(all).toContain('education');
    expect(all).toContain('belarusian state university');
    for (const lang of PROFILE.languages) expect(all).toContain(words(lang.en));
  });

  test('every page has a footer band, and only footer text sits in it', () => {
    pages.forEach((page, i) => {
      const band = footerBand(page);
      expect(band, `page ${i + 1} footer band`).toBeDefined();
      if (!band) return;
      expect(band.y + band.h, `page ${i + 1} band stays in the bottom margin`).toBeLessThan(70);
      for (const t of page.texts) {
        const inside = t.y > band.y && t.y + t.size * 0.75 < band.y + band.h;
        const clearAbove = t.y - t.size * 0.25 > band.y + band.h + 6;
        expect(inside || clearAbove, `page ${i + 1}: "${t.text}" at y=${t.y}`).toBe(true);
      }
    });
  });

  test('canary #42 lives inside the footer band of the last page, for whoever reads to the end', () => {
    const last = pages[pages.length - 1];
    const band = footerBand(last);
    const holders = last.texts.filter((t) => /canary #42/i.test(t.text) && band && t.y > band.y && t.y < band.y + band.h);
    expect(holders.length).toBeGreaterThan(0);
  });

  test('no text line is drawn over another', () => {
    pages.forEach((page, i) => {
      const t = page.texts;
      for (let a = 0; a < t.length; a++) {
        for (let b = a + 1; b < t.length; b++) {
          const dy = Math.abs(t[a].y - t[b].y);
          const where = `page ${i + 1}: "${t[a].text}" / "${t[b].text}"`;
          if (dy <= 0.5) {
            // Same baseline: must not collide horizontally (0.45em per char underestimates Helvetica).
            const [l, r] = t[a].x <= t[b].x ? [t[a], t[b]] : [t[b], t[a]];
            expect(l.x + l.text.length * l.size * 0.45, where).toBeLessThanOrEqual(r.x);
          } else {
            expect(dy, where).toBeGreaterThanOrEqual(0.8 * Math.max(t[a].size, t[b].size));
          }
        }
      }
    });
  });
});

describe('CV PDF typography', () => {
  test('no "--" used as a dash and no ">" used as a bullet', () => {
    expect(fullText).not.toContain('--');
    for (const page of pages) for (const t of page.texts) expect(t.text.trimStart().startsWith('>'), t.text).toBe(false);
  });

  test('all text is at least 5pt and body text reads at 9–11pt', () => {
    const sizes = pages.flatMap((p) => p.texts);
    expect(sizes.filter((t) => t.size < 5)).toEqual([]);
    // The size that carries the most characters is the body size.
    const weight = new Map<number, number>();
    for (const t of sizes) weight.set(t.size, (weight.get(t.size) ?? 0) + t.text.length);
    const body = [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(body).toBeGreaterThanOrEqual(9);
    expect(body).toBeLessThanOrEqual(11);
  });
});

describe('CV PDF text for ATS', () => {
  test('text objects come in reading order: top to bottom, left to right on a line', () => {
    pages.forEach((page, i) => {
      for (let k = 1; k < page.texts.length; k++) {
        const [p, n] = [page.texts[k - 1], page.texts[k]];
        const ok = n.y < p.y - 0.5 || (Math.abs(n.y - p.y) <= 0.5 && n.x > p.x);
        expect(ok, `page ${i + 1}: "${p.text}" then "${n.text}"`).toBe(true);
      }
    });
  });

  // poppler measures real glyph widths (machines without it skip this; CI installs it). Margins are at least 45pt.
  const hasPdftotext = (() => {
    try {
      execSync('pdftotext -v', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  test.skipIf(!hasPdftotext)('every word stays inside the page margins (pdftotext -bbox)', () => {
    const html = execSync('pdftotext -bbox public/gleb-rosev-cv.pdf -', { encoding: 'utf8' });
    const pageW = Number(html.match(/<page width="([\d.]+)"/)?.[1]);
    const words = [...html.matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)];
    expect(words.length).toBeGreaterThan(100);
    const outside = words.filter((m) => Number(m[1]) < 45 || Number(m[2]) > pageW - 45).map((m) => m[3]);
    expect(outside).toEqual([]);
  });

  test('sections and roles extract in document order', () => {
    const all = words(fullText);
    const order = [
      words(PROFILE.name.en),
      'summary',
      ...EXPERIENCE.map((e) => words(e.company)),
      words(CAPABILITIES[0].title.en),
      'education',
    ];
    // Each one is found after the previous (the header may name the company first; that's fine).
    let from = 0;
    for (const w of order) {
      const at = all.indexOf(w, from);
      expect(at, `"${w}" after position ${from}`).toBeGreaterThanOrEqual(0);
      from = at + w.length;
    }
  });
});
