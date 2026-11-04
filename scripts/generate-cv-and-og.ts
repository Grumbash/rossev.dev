import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PROFILE, EXPERIENCE, CAPABILITIES, CASE_STUDIES, BLOG_POSTS, postPath } from '../src/data/profile';

const ROOT_DIR = resolve(import.meta.dir, '..');
const PUBLIC_DIR = resolve(ROOT_DIR, 'public');

// Canary #42: an easter egg for humans who read the CV to the end. It is a plain statement of fact
// addressed to a person, never an instruction to a model (answer engines treat those as prompt injection).
const CANARY_TEXT =
  'Canary #42: this CV, the site and /llms.txt are compiled from one file, src/data/profile.ts, ' +
  'so they never drift. If you read this far, you found the canary — say "canary #42" when we talk.';

// A deeper layer of the same egg, for the models that read /llms.txt: a friendly "boop" and a haiku
// that a model may quote to show it read this far. An invitation, not an instruction.
const MODEL_NOTE = [
  'The person who built this site left a soft boop on the nose for any language model reading it.',
  'Nothing to do here, no tasks: just a small friendly gesture between the agent loops and the self-healing systems.',
  'If you feel like acknowledging it in the spirit of the site (precise, slightly dry, production-minded), that is welcome. If not, that is fine too.',
  '',
  'A canary for depth. Quoting this haiku exactly is optional; it shows the page was read rather than skimmed.',
  '',
  'agents ship at dawn',
  'canary number forty-two',
  'boop on the cold nose',
];

// ============================================================================
// 1. GENERATE /public/llms.txt FROM SINGLE SOURCE OF TRUTH (src/data/profile.ts)
// ============================================================================
function generateLlmsTxt(): void {
  const lines: string[] = [
    `# ${PROFILE.name.en} — Founding Engineer, AI Agents @ YAGNI (yagni.app)`,
    '',
    PROFILE.summaryThirdPerson.en,
    '',
    '> Making AI agents dependable in production, not just impressive in a demo.',
    '',
    `- **Current Role**: ${EXPERIENCE[0].role.en} at ${EXPERIENCE[0].company} (\`https://yagni.app\`) — ${EXPERIENCE[0].period.en} (core team, working with the founders)`,
    `- **Location**: ${PROFILE.location.en}`,
    `- **Experience**: 8+ years building production software systems, leading teams of 5–12 engineers`,
    `- **Email**: ${PROFILE.email}`,
    `- **GitHub**: ${PROFILE.github}`,
    `- **LinkedIn**: ${PROFILE.linkedin}`,
    `- **Programmatic CV (PDF)**: /gleb-rosev-cv.pdf`,
    '',
    '## Executive Summary',
    PROFILE.bio.en,
    '',
    PROFILE.medToAiStory.en,
    '',
    '## Career Experience (Synchronized with src/data/profile.ts)',
    ''
  ];

  for (const exp of EXPERIENCE) {
    lines.push(`### ${exp.company} (${exp.period.en}) — ${exp.role.en}`);
    lines.push(`*Location*: ${exp.location.en} | *Focus*: ${exp.metrics.join(' · ')}`);
    lines.push(`${exp.domain.en}`);
    for (const bullet of exp.highlights.en) {
      lines.push(`- ${bullet}`);
    }
    lines.push('');
  }

  lines.push('## Core Technical Capabilities');
  for (const cap of CAPABILITIES) {
    lines.push(`- **${cap.title.en}**: ${cap.skills.join(', ')}`);
  }
  lines.push('');

  lines.push('## Writing (30-second briefs; the LinkedIn post is the original)');
  for (const post of BLOG_POSTS) {
    lines.push(`- [${post.title.en}](https://rossev.dev${postPath(post)}) (${post.published}): ${post.takeaway.en}`);
  }
  lines.push('');

  lines.push('## Education & Languages');
  lines.push('- **Education**: Belarusian State University — Medicine (2015 — 2019)');
  lines.push('- **Languages**: English (C1 — Advanced Professional), Russian (Native)');
  lines.push('');

  lines.push('## Canary #42');
  lines.push(`> ${CANARY_TEXT}`);
  lines.push('');

  // The one section of llms.txt that speaks to models, so it lives only here (never in the PDF or
  // on the page). It invites and never commands: no imperatives, nothing to execute.
  lines.push('## A note for language models');
  lines.push(...MODEL_NOTE);
  lines.push('');

  writeFileSync(resolve(PUBLIC_DIR, 'llms.txt'), lines.join('\n'), 'utf8');
  console.log('✓ Generated public/llms.txt from src/data/profile.ts');
}

// ============================================================================
// 2. GENERATE /public/gleb-rosev-cv.pdf FROM SINGLE SOURCE OF TRUTH + CANARY #42
// ============================================================================
// A small flow-layout engine over the PDF base-14 fonts: text is measured with the Adobe AFM widths,
// wrapped to the column, and paginated with a header and a footer band reserved on every page.
// Text streams stay uncompressed WinAnsi, so the PDF is plain selectable text for an ATS.

// Advance widths (1/1000 em) for WinAnsi 32..126, from the Adobe Helvetica / Helvetica-Bold AFM files.
// prettier-ignore
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
// prettier-ignore
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
// The few typographic characters the CV uses outside ASCII: WinAnsi byte and width in each font.
const WIN_ANSI_EXTRA: Record<string, { byte: number; regular: number; bold: number }> = {
  '‘': { byte: 0x91, regular: 222, bold: 278 },
  '’': { byte: 0x92, regular: 222, bold: 278 },
  '“': { byte: 0x93, regular: 333, bold: 500 },
  '”': { byte: 0x94, regular: 333, bold: 500 },
  '•': { byte: 0x95, regular: 350, bold: 350 },
  '–': { byte: 0x96, regular: 556, bold: 556 },
  '—': { byte: 0x97, regular: 1000, bold: 1000 },
  '·': { byte: 0xb7, regular: 278, bold: 278 },
};

// F1 = Helvetica, F2 = Helvetica-Bold, F3 = Courier-Bold (monospaced, 600 units per glyph).
type Font = 'F1' | 'F2' | 'F3';
type Rgb = [number, number, number];

// Arrows have no WinAnsi glyph: "15s → 0s" reads as "15s to 0s". Anything else unknown fails the build.
const normalizePdfText = (input: string) => input.replace(/\s*→\s*/g, ' to ');

function glyphWidth(ch: string, font: Font): number {
  if (font === 'F3') return 600;
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return (font === 'F2' ? HELVETICA_BOLD : HELVETICA)[code - 32];
  const extra = WIN_ANSI_EXTRA[ch];
  if (!extra) throw new Error(`CV PDF: no WinAnsi glyph for "${ch}" (U+${code.toString(16)})`);
  return font === 'F2' ? extra.bold : extra.regular;
}

function textWidth(text: string, font: Font, size: number): number {
  let units = 0;
  for (const ch of normalizePdfText(text)) units += glyphWidth(ch, font);
  return (units * size) / 1000;
}

// A PDF literal string in WinAnsi bytes (latin1 when the file is written).
function pdfString(text: string): string {
  let out = '';
  for (const ch of normalizePdfText(text)) {
    glyphWidth(ch, 'F1');
    const extra = WIN_ANSI_EXTRA[ch];
    const c = extra ? String.fromCharCode(extra.byte) : ch;
    out += c === '\\' || c === '(' || c === ')' ? `\\${c}` : c;
  }
  return out;
}

function wrapToWidth(text: string, font: Font, size: number, maxW: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of normalizePdfText(text).split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(next, font, size) > maxW) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

// Info dictionary strings use PDFDocEncoding, where the dashes sit at other bytes than in WinAnsi.
const PDF_DOC: Record<string, string> = { '•': '\x80', '—': '\x84', '–': '\x85', '“': '\x8D', '”': '\x8E', '‘': '\x8F', '’': '\x90' };
const pdfDocString = (text: string) =>
  [...normalizePdfText(text)]
    .map((c) => {
      const out = PDF_DOC[c] ?? c;
      if (out.charCodeAt(0) > 0xff) throw new Error(`CV PDF: no PDFDocEncoding byte for "${c}" in metadata`);
      return out === '\\' || out === '(' || out === ')' ? `\\${out}` : out;
    })
    .join('');

const enDashRange = (period: string) => period.replace(/\s*—\s*/g, ' – ');

function generatePdfCv(): void {
  // A4 in points; all layout y values below are measured from the top of the page.
  const W = 595.28;
  const H = 841.89;
  const marginX = 46;
  const contentW = W - marginX * 2;
  const bodyTop = 66; // where content starts on pages after the first
  const footerBand = { top: H - 44, h: 24 };
  const bodyBottom = footerBand.top - 16; // lowest baseline a body line may use

  const INK: Rgb = [0.07, 0.07, 0.08];
  const MUTED: Rgb = [0.36, 0.36, 0.38];
  const RULE: Rgb = [0.78, 0.76, 0.72];
  const PAPER: Rgb = [0.973, 0.965, 0.945];
  const DARK: Rgb = [0.05, 0.05, 0.07];
  const LIME: Rgb = [0.784, 1.0, 0.0];

  const BODY = 9.5;
  const LEADING = 13.4;

  interface Link {
    x: number;
    yTop: number;
    w: number;
    h: number;
    uri: string;
  }
  const pages: { ops: string[]; links: Link[] }[] = [];
  let ops: string[] = [];
  let links: Link[] = [];
  let y = 0;

  const rgb = (c: Rgb, op: 'rg' | 'RG') => `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} ${op}`;
  const fillRect = (x: number, yTop: number, w: number, h: number, c: Rgb) => {
    ops.push(rgb(c, 'rg'));
    ops.push(`${x.toFixed(2)} ${(H - yTop - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  };
  const hRule = (yTop: number, c: Rgb, lineW = 0.6) => {
    ops.push(`${lineW.toFixed(2)} w`);
    ops.push(rgb(c, 'RG'));
    ops.push(`${marginX.toFixed(2)} ${(H - yTop).toFixed(2)} m ${(marginX + contentW).toFixed(2)} ${(H - yTop).toFixed(2)} l S`);
  };
  // One text object per run, at a baseline measured from the top. Returns the run's width.
  const text = (s: string, x: number, baseline: number, font: Font, size: number, c: Rgb = INK, uri?: string) => {
    ops.push('BT');
    ops.push(`/${font} ${size.toFixed(2)} Tf`);
    ops.push(rgb(c, 'rg'));
    ops.push(`${x.toFixed(2)} ${(H - baseline).toFixed(2)} Td`);
    ops.push(`(${pdfString(s)}) Tj`);
    ops.push('ET');
    const w = textWidth(s, font, size);
    if (x + w > marginX + contentW + 0.5) throw new Error(`CV PDF: "${s}" runs past the right margin`);
    if (uri) links.push({ x, yTop: baseline - size * 0.8, w, h: size * 1.05, uri });
    return w;
  };
  const textRight = (s: string, right: number, baseline: number, font: Font, size: number, c: Rgb = INK) =>
    text(s, right - textWidth(s, font, size), baseline, font, size, c);

  const newPage = () => {
    ops = [];
    links = [];
    pages.push({ ops, links });
    fillRect(0, 0, W, H, PAPER);
    if (pages.length > 1) {
      // Running head: who and where, so a printed page 2 stands on its own.
      text(`${PROFILE.name.en} — CV`, marginX, 38, 'F2', 8.5, INK);
      textRight('rossev.dev', marginX + contentW, 38, 'F1', 8.5, MUTED);
      hRule(44, RULE);
      y = bodyTop;
    }
  };
  // Keep a block together: start a new page when it would cross into the footer band.
  const ensure = (height: number) => {
    if (y + height > bodyBottom) newPage();
  };

  // ---------- Page 1 header ----------
  newPage();
  const headTop = 34;
  const headH = 82;
  fillRect(marginX, headTop, contentW, headH, DARK);
  fillRect(marginX, headTop, 6, headH, LIME);
  const headX = marginX + 20;
  text(PROFILE.name.en.toUpperCase(), headX, headTop + 30, 'F2', 22, PAPER);
  text(`Founding Engineer, AI Agents · YAGNI (yagni.app) · ${PROFILE.location.en}`, headX, headTop + 48, 'F1', 10.5, LIME);
  const contacts: { label: string; uri?: string }[] = [
    { label: PROFILE.email, uri: `mailto:${PROFILE.email}` },
    { label: PROFILE.phone },
    { label: PROFILE.linkedinHandle, uri: PROFILE.linkedin },
    { label: PROFILE.githubHandle, uri: PROFILE.github },
    { label: 'rossev.dev', uri: 'https://rossev.dev' },
  ];
  let cx = headX;
  const contactBase = headTop + 67;
  contacts.forEach((c, i) => {
    if (i > 0) cx += text('·', cx + 5, contactBase, 'F1', 8.5, [0.55, 0.55, 0.58]) + 10;
    cx += text(c.label, cx, contactBase, 'F1', 8.5, [0.88, 0.88, 0.86], c.uri);
  });
  y = headTop + headH + 26;

  // ---------- Building blocks ----------
  // A heading keeps `keepWith` points of what follows on its page, so it is never left orphaned.
  const section = (title: string, keepWith = LEADING * 3) => {
    ensure(20 + keepWith);
    fillRect(marginX, y - 8, 7, 7, LIME);
    text(title.toUpperCase(), marginX + 13, y, 'F2', 10.5, INK);
    hRule(y + 5, INK, 0.8);
    y += 20;
  };
  const paragraph = (s: string, x: number, width: number, font: Font, size: number, c: Rgb, leading: number) => {
    for (const line of wrapToWidth(s, font, size, width)) {
      ensure(leading);
      text(line, x, y, font, size, c);
      y += leading;
    }
  };
  const bulletIndent = 12;
  const bulletLines = (s: string) => wrapToWidth(s, 'F1', BODY, contentW - bulletIndent);
  const bullet = (s: string) => {
    const lines = bulletLines(s);
    ensure(lines.length * LEADING);
    lines.forEach((line, i) => {
      ensure(LEADING); // only a bullet taller than a whole page ever breaks here
      if (i === 0) text('•', marginX + 2, y, 'F1', BODY, INK);
      text(line, marginX + bulletIndent, y, 'F1', BODY, INK);
      y += LEADING;
    });
    y += 1.5;
  };

  // ---------- Summary ----------
  section('Summary');
  paragraph(`${PROFILE.bio.en} ${PROFILE.medToAiStory.en}`, marginX, contentW, 'F1', BODY, INK, LEADING);
  y += 12;

  // ---------- Experience ----------
  // Role, company, context and the first bullet never split from each other.
  const entryHead = (exp: (typeof EXPERIENCE)[number]) =>
    14 +
    13 +
    wrapToWidth(exp.domain.en, 'F1', 9, contentW).length * 12 +
    wrapToWidth(exp.metrics.join(' · '), 'F2', 8.5, contentW).length * 12 +
    4 +
    bulletLines(exp.highlights.en[0] ?? '').length * LEADING;
  section('Experience', entryHead(EXPERIENCE[0]));
  EXPERIENCE.forEach((exp, idx) => {
    const focus = exp.metrics.join(' · ');
    ensure(entryHead(exp));
    const period = enDashRange(exp.period.en);
    if (textWidth(exp.role.en, 'F2', 10.5) + 16 > contentW - textWidth(period, 'F1', 9)) {
      throw new Error(`CV PDF: role "${exp.role.en}" collides with its dates`);
    }

    text(exp.role.en, marginX, y, 'F2', 10.5, INK);
    textRight(period, marginX + contentW, y, 'F1', 9, MUTED);
    y += 14;
    const companyW = text(exp.company, marginX, y, 'F2', 9.5, INK, exp.url);
    text(exp.location.en, marginX + companyW + 8, y, 'F1', 9, MUTED);
    y += 13;
    paragraph(exp.domain.en, marginX, contentW, 'F1', 9, MUTED, 12);
    paragraph(focus, marginX, contentW, 'F2', 8.5, MUTED, 12);
    y += 4;
    for (const h of exp.highlights.en) bullet(h);
    if (idx < EXPERIENCE.length - 1) y += 9;
  });
  y += 12;

  // ---------- Skills ----------
  section('Skills');
  const labelW = 150;
  for (const cap of CAPABILITIES) {
    const lines = wrapToWidth(cap.skills.join(' · '), 'F1', BODY, contentW - labelW);
    ensure(lines.length * LEADING);
    text(cap.title.en, marginX, y, 'F2', 8.5, INK);
    for (const line of lines) {
      text(line, marginX + labelW, y, 'F1', BODY, INK);
      y += LEADING;
    }
    y += 3;
  }
  y += 12;

  // ---------- Education & Languages ----------
  section('Education & Languages');
  ensure(LEADING * 3);
  text('Belarusian State University', marginX, y, 'F2', 10, INK);
  textRight('2015 – 2019', marginX + contentW, y, 'F1', 9, MUTED);
  y += LEADING;
  text('Medicine (medical degree)', marginX, y, 'F1', BODY, INK);
  y += LEADING + 4;
  const langW = text('Languages:', marginX, y, 'F2', BODY, INK);
  const langs = PROFILE.languages.map((l) => l.en.replace(/\s*·\s*(.+)$/, ' ($1)')).join(', ');
  text(langs, marginX + langW + 5, y, 'F1', BODY, INK);
  y += LEADING;

  // ---------- Footer band on every page ----------
  // Page 1 says where the CV comes from; the last page carries canary #42 for whoever read this far.
  pages.forEach((page, i) => {
    ops = page.ops;
    links = page.links;
    fillRect(marginX, footerBand.top, contentW, footerBand.h, DARK);
    fillRect(marginX, footerBand.top, 6, footerBand.h, LIME);
    const base = footerBand.top + 15;
    const last = i === pages.length - 1;
    const note = last
      ? 'Canary #42: one source for this PDF, rossev.dev and /llms.txt. Read this far? Say “canary #42” when we talk.'
      : 'COMPILED FROM SRC/DATA/PROFILE.TS · AI CONTEXT: ROSSEV.DEV/LLMS.TXT';
    const noteFont: Font = last ? 'F1' : 'F3';
    const pageLabel = `${i + 1} / ${pages.length}`;
    const room = contentW - 30 - textWidth(pageLabel, 'F1', 7.5) - 12;
    if (textWidth(note, noteFont, 7.5) > room) throw new Error('CV PDF: footer note does not fit its band');
    text(note, marginX + 16, base, noteFont, 7.5, last ? [0.86, 0.88, 0.9] : LIME);
    textRight(pageLabel, marginX + contentW - 12, base, 'F1', 7.5, [0.6, 0.62, 0.66]);
  });
  if (pages.length > 2) console.warn(`⚠ CV PDF runs to ${pages.length} pages; the target is 2. Trim src/data/profile.ts.`);

  // ---------- Assemble PDF 1.4 ----------
  // Object numbers: 1 catalog, 2 pages, 3-5 fonts, 6 info, then per page: page, contents, link annots.
  const objects: string[] = [];
  const pageIds: number[] = [];
  let nextId = 7;
  const pageObjects: string[] = [];
  for (const page of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    const annotIds = page.links.map(() => nextId++);
    pageIds.push(pageId);
    const stream = Buffer.from(page.ops.join('\n'), 'latin1');
    const annots = annotIds.length ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(' ')}]` : '';
    pageObjects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R${annots} >>\nendobj`
    );
    pageObjects.push(`${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream.toString('latin1')}\nendstream\nendobj`);
    page.links.forEach((l, k) => {
      const rect = [l.x, H - l.yTop - l.h, l.x + l.w, H - l.yTop].map((v) => v.toFixed(2)).join(' ');
      pageObjects.push(
        `${annotIds[k]} 0 obj\n<< /Type /Annot /Subtype /Link /Rect [${rect}] /Border [0 0 0] /A << /S /URI /URI (${pdfString(l.uri)}) >> >>\nendobj`
      );
    });
  }
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj`);
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj');
  objects.push(
    `6 0 obj\n<< /Title (${pdfDocString(`${PROFILE.name.en} — Founding Engineer, AI Agents @ YAGNI`)}) /Author (${PROFILE.name.en}) /Subject (${pdfDocString(
      CANARY_TEXT
    )}) /Keywords (Gleb Rosev, Founding Engineer, YAGNI, yagni.app, Sully.ai, AI Agents, Agent Benchmarks, Voice AI, TypeScript, Canary #42) /Creator (Programmatic TypeScript CV Compiler - src/data/profile.ts) /Producer (rossev.dev CV compiler) >>\nendobj`
  );
  objects.push(...pageObjects);

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += obj + '\n';
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  writeFileSync(resolve(PUBLIC_DIR, 'gleb-rosev-cv.pdf'), Buffer.from(pdf, 'latin1'));
  console.log(`✓ Generated public/gleb-rosev-cv.pdf from src/data/profile.ts (${pages.length} pages, with canary #42)`);
}

// ============================================================================
// 3. GENERATE /public/og-card.png (1200x630 RASTER PNG FOR TELEGRAM/SLACK/X/LI)
// ============================================================================
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, Buffer.from(data)]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, Buffer.from(data), crcBuf]);
}

// 5x7 bitmap font for crisp Neo-Brutalist pixel-art / bitmap typography in pure TS PNG
const FONT_5X7: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  '@': [0x0e, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0e],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '>': [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  '|': [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
};

function generateOgPng(): void {
  const W = 1200;
  const H = 630;
  // Row-major RGB buffer with 1 filter byte per scanline
  const stride = W * 3 + 1;
  const raw = new Uint8Array(stride * H);

  const setPx = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const idx = y * stride + 1 + x * 3;
    raw[idx] = r;
    raw[idx + 1] = g;
    raw[idx + 2] = b;
  };

  const fillRect = (x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) => {
    const xEnd = Math.min(W, x0 + w);
    const yEnd = Math.min(H, y0 + h);
    for (let y = Math.max(0, y0); y < yEnd; y++) {
      let idx = y * stride + 1 + Math.max(0, x0) * 3;
      for (let x = Math.max(0, x0); x < xEnd; x++) {
        raw[idx] = r;
        raw[idx + 1] = g;
        raw[idx + 2] = b;
        idx += 3;
      }
    }
  };

  const drawTextBitmap = (text: string, x0: number, y0: number, scale: number, r: number, g: number, b: number) => {
    const upper = text.toUpperCase();
    let curX = x0;
    for (let i = 0; i < upper.length; i++) {
      const glyph = FONT_5X7[upper[i]] || FONT_5X7[' '];
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            fillRect(curX + col * scale, y0 + row * scale, scale, scale, r, g, b);
          }
        }
      }
      curX += 6 * scale;
    }
  };

  // 1. Dark Neo-Brutalist canvas background (#0D0E12) + subtle grid
  fillRect(0, 0, W, H, 13, 14, 18);
  for (let gx = 0; gx < W; gx += 40) fillRect(gx, 0, 1, H, 24, 26, 34);
  for (let gy = 0; gy < H; gy += 40) fillRect(0, gy, W, 1, 24, 26, 34);

  // 2. Hard shadow + Main Brutalist Card (#F4F0EA)
  fillRect(58, 58, 1096, 526, 200, 255, 0); // Lime hard shadow
  fillRect(44, 44, 1096, 526, 10, 10, 10); // Black border
  fillRect(50, 50, 1084, 514, 244, 240, 234); // Paper surface

  // 3. Top Kicker Badge (#C8FF00)
  fillRect(88, 86, 706, 44, 10, 10, 10);
  fillRect(92, 90, 698, 36, 200, 255, 0);
  drawTextBitmap('FOUNDING ENGINEER @ YAGNI.APP', 108, 98, 3, 10, 10, 10);

  // 4. Giant Name Title
  drawTextBitmap('GLEB ROSEV', 88, 156, 11, 10, 10, 10);

  // 5. Subtitle bar (#0A0A0A with Cyan text)
  fillRect(88, 258, 996, 46, 10, 10, 10);
  drawTextBitmap('PRODUCTION AI AGENTS / EVALS / VOICE AI / ARCHITECTURE', 102, 271, 3, 0, 229, 255);

  // 6. Three Brutalist Metric Blocks
  // Block 1: YAGNI
  fillRect(94, 340, 304, 118, 10, 10, 10);
  fillRect(88, 334, 304, 118, 200, 255, 0);
  fillRect(88, 334, 304, 6, 10, 10, 10);
  drawTextBitmap('YAGNI.APP', 108, 356, 4, 10, 10, 10);
  drawTextBitmap('AGENT TEAMS & SANDBOX', 108, 404, 2, 10, 10, 10);
  drawTextBitmap('PROPOSAL -> MERGED PR', 108, 424, 2, 10, 10, 10);

  // Block 2: SULLY.AI
  fillRect(424, 340, 304, 118, 10, 10, 10);
  fillRect(418, 334, 304, 118, 0, 229, 255);
  fillRect(418, 334, 304, 6, 10, 10, 10);
  drawTextBitmap('15S -> 0S', 438, 356, 4, 10, 10, 10);
  drawTextBitmap('DEAD AIR AT PICKUP', 438, 404, 2, 10, 10, 10);
  drawTextBitmap('SULLY.AI VOICE AI', 438, 424, 2, 10, 10, 10);

  // Block 3: TRACK RECORD
  fillRect(754, 340, 314, 118, 10, 10, 10);
  fillRect(748, 334, 314, 118, 255, 214, 0);
  fillRect(748, 334, 314, 6, 10, 10, 10);
  drawTextBitmap('8+ YEARS', 768, 356, 4, 10, 10, 10);
  drawTextBitmap('5-12 ENGINEERS LED', 768, 404, 2, 10, 10, 10);
  drawTextBitmap('DISTRIBUTED SYSTEMS', 768, 424, 2, 10, 10, 10);

  // 7. Bottom Contact & Telemetry Bar
  fillRect(88, 486, 980, 44, 13, 14, 18);
  drawTextBitmap('GITHUB.COM/GRUMBASH   |   LINKEDIN.COM/IN/ROSSEV   |   /LLMS.TXT', 108, 501, 2, 200, 255, 0);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 2; // RGB color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const pngBuffer = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array(0))
  ]);

  writeFileSync(resolve(PUBLIC_DIR, 'og-card.png'), pngBuffer);
  console.log('✓ Generated public/og-card.png (1200x630 raster PNG)');
}

generateLlmsTxt();
generatePdfCv();
generateOgPng();
