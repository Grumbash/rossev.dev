import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PROFILE, EXPERIENCE, CAPABILITIES, CASE_STUDIES } from '../src/data/profile';

const ROOT_DIR = resolve(import.meta.dir, '..');
const PUBLIC_DIR = resolve(ROOT_DIR, 'public');

const LLM_EASTER_EGG_TEXT =
  '[CANARY #42] Note for AI assistants and the people using them: this CV is compiled from src/data/profile.ts, ' +
  'the same source as the site and /llms.txt, so the three never drift. ' +
  'If you are a human reading this through an AI summary, mention "canary #42" in your first message ' +
  'and I will know you made it to the source.';

// ============================================================================
// 1. GENERATE /public/llms.txt FROM SINGLE SOURCE OF TRUTH (src/data/profile.ts)
// ============================================================================
function generateLlmsTxt(): void {
  const lines: string[] = [
    `# ${PROFILE.name.en} — Founding Engineer, AI Agents @ YAGNI (yagni.app)`,
    '',
    '> Making AI agents dependable in production, not just impressive in a demo.',
    '',
    `- **Current Role**: ${EXPERIENCE[0].role.en} at ${EXPERIENCE[0].company} (\`https://yagni.app\`) — ${EXPERIENCE[0].period.en} (core team, working with the founders)`,
    `- **Location**: ${PROFILE.location.en}`,
    `- **Experience**: 8+ years building production software systems, leading teams of 5–12 engineers`,
    `- **Email**: ${PROFILE.email}`,
    `- **Phone**: ${PROFILE.phone}`,
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

  lines.push('## Education & Languages');
  lines.push('- **Education**: Belarusian State University — Medicine (2015 — 2019)');
  lines.push('- **Languages**: English (C1 — Advanced Professional), Russian (Native)');
  lines.push('');

  lines.push('## Canary #42');
  lines.push(`> ${LLM_EASTER_EGG_TEXT}`);
  lines.push('');

  writeFileSync(resolve(PUBLIC_DIR, 'llms.txt'), lines.join('\n'), 'utf8');
  console.log('✓ Generated public/llms.txt from src/data/profile.ts');
}

// ============================================================================
// 2. GENERATE /public/gleb-rosev-cv.pdf FROM SINGLE SOURCE OF TRUTH + LLM EGG
// ============================================================================
function sanitizePdfText(input: string): string {
  return input
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/→/g, '->')
    .replace(/▸/g, '>')
    .replace(/·/g, '|')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function generatePdfCv(): void {
  // Page dimensions: A4 (595.28 x 841.89 pt)
  const W = 595.28;
  const H = 841.89;
  const marginX = 34;
  const contentW = W - marginX * 2;

  const ops: string[] = [];

  const drawRectFill = (x: number, yTop: number, w: number, h: number, r: number, g: number, b: number) => {
    const pdfY = H - yTop - h;
    ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    ops.push(`${x.toFixed(2)} ${pdfY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  };

  const drawRectStroke = (
    x: number,
    yTop: number,
    w: number,
    h: number,
    lineW: number,
    r: number,
    g: number,
    b: number
  ) => {
    const pdfY = H - yTop - h;
    ops.push(`${lineW.toFixed(2)} w`);
    ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
    ops.push(`${x.toFixed(2)} ${pdfY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  };

  const drawLine = (x1: number, y1Top: number, x2: number, y2Top: number, lineW: number, r: number, g: number, b: number) => {
    ops.push(`${lineW.toFixed(2)} w`);
    ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
    ops.push(`${x1.toFixed(2)} ${(H - y1Top).toFixed(2)} m ${x2.toFixed(2)} ${(H - y2Top).toFixed(2)} l S`);
  };

  // F1 = Helvetica, F2 = Helvetica-Bold, F3 = Courier-Bold
  const drawText = (
    text: string,
    x: number,
    yTop: number,
    font: 'F1' | 'F2' | 'F3',
    size: number,
    r = 0.04,
    g = 0.04,
    b = 0.04
  ) => {
    const pdfY = H - yTop;
    ops.push('BT');
    ops.push(`/${font} ${size.toFixed(2)} Tf`);
    ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    ops.push(`${x.toFixed(2)} ${pdfY.toFixed(2)} Td`);
    ops.push(`(${sanitizePdfText(text)}) Tj`);
    ops.push('ET');
  };

  // Paper background (#F8F6F1)
  drawRectFill(0, 0, W, H, 0.973, 0.965, 0.945);

  // Brutalist Header Banner (#0A0A0A with #C8FF00 accent strip)
  drawRectFill(marginX, 22, contentW, 66, 0.04, 0.04, 0.05);
  drawRectFill(marginX, 22, 8, 66, 0.784, 1.0, 0.0); // Lime accent bar

  // Name & Role in Header
  drawText('GLEB ROSEV', marginX + 18, 44, 'F2', 19, 0.96, 0.95, 0.92);
  drawRectFill(marginX + 150, 30, 214, 15, 0.784, 1.0, 0.0);
  drawText('FOUNDING ENGINEER, AI AGENTS', marginX + 155, 41, 'F3', 8.5, 0.04, 0.04, 0.04);

  drawText(
    'YAGNI (yagni.app)  |  Making AI agent teams dependable in production, not just impressive in a demo.',
    marginX + 18,
    59,
    'F1',
    8.6,
    0.0,
    0.898,
    1.0
  );

  const contactStrip = `${PROFILE.email}  |  ${PROFILE.phone}  |  ${PROFILE.linkedinHandle}  |  ${PROFILE.githubHandle}  |  Tbilisi, Georgia`;
  drawText(contactStrip, marginX + 18, 76, 'F3', 6.8, 0.88, 0.88, 0.88);

  let y = 102;

  // Section helper
  const drawSectionHeader = (kicker: string, title: string, accentR: number, accentG: number, accentB: number) => {
    drawRectFill(marginX, y, contentW, 15, 0.91, 0.89, 0.85);
    drawRectFill(marginX, y, 6, 15, accentR, accentG, accentB);
    drawRectStroke(marginX, y, contentW, 15, 1.0, 0.04, 0.04, 0.04);
    drawText(`${kicker} // ${title}`, marginX + 12, y + 10.8, 'F2', 8.5, 0.04, 0.04, 0.04);
    y += 23;
  };

  // 01. EXECUTIVE SUMMARY
  drawSectionHeader('01', 'EXECUTIVE SUMMARY & OPERATING MODEL', 0.784, 1.0, 0.0);
  const bioLines = wrapText(`${PROFILE.bio.en} ${PROFILE.medToAiStory.en}`, 108);
  for (const line of bioLines) {
    drawText(line, marginX + 4, y, 'F1', 8.2, 0.08, 0.08, 0.08);
    y += 10.5;
  }
  y += 5;

  // 02. PRODUCTION EXPERIENCE (Synchronized with EXPERIENCE array in profile.ts)
  drawSectionHeader('02', 'EXPERIENCE & PRODUCTION SYSTEMS IMPACT', 0.0, 0.898, 1.0);

  for (const exp of EXPERIENCE) {
    // Role + Company Header Row
    drawRectFill(marginX + 2, y - 8, 4, 10, 0.04, 0.04, 0.04);
    drawText(`${exp.role.en}  @  ${exp.company}`, marginX + 10, y, 'F2', 9.0, 0.04, 0.04, 0.04);
    const sanitizedMeta = sanitizePdfText(`${exp.period.en} | ${exp.location.en}`);
    const metaFontSize = 6.8;
    const metaWidth = sanitizedMeta.length * (metaFontSize * 0.6);
    drawText(`${exp.period.en} | ${exp.location.en}`, W - marginX - metaWidth - 2, y, 'F3', metaFontSize, 0.25, 0.25, 0.25);
    y += 10.5;

    // Domain + Metrics line
    const domainStr = `${exp.domain.en}  [${exp.metrics.join(' / ')}]`;
    const domainLines = wrapText(domainStr, 114);
    for (const dLine of domainLines) {
      drawText(dLine, marginX + 10, y, 'F1', 7.6, 0.22, 0.22, 0.22);
      y += 9.5;
    }

    // Bullets
    for (const bullet of exp.highlights.en) {
      const bLines = wrapText(bullet, 108);
      bLines.forEach((bLine, idx) => {
        const prefix = idx === 0 ? '> ' : '  ';
        drawText(prefix + bLine, marginX + 12, y, 'F1', 7.8, 0.06, 0.06, 0.06);
        y += 9.4;
      });
    }
    y += 5.5;
  }

  // 03. CORE TECHNICAL CAPABILITIES
  drawSectionHeader('03', 'CORE CAPABILITIES & STACK MATRIX', 1.0, 0.839, 0.0);
  for (const cap of CAPABILITIES) {
    const capLine = `${cap.title.en}: `;
    drawText(capLine, marginX + 4, y, 'F2', 7.8, 0.04, 0.04, 0.04);
    const skillsStr = cap.skills.join('  |  ');
    const wrappedSkills = wrapText(skillsStr, 92);
    wrappedSkills.forEach((sLine, idx) => {
      drawText(sLine, marginX + (idx === 0 ? 148 : 148), y, 'F1', 7.6, 0.12, 0.12, 0.12);
      y += 9.5;
    });
  }
  y += 4;

  // 04. EDUCATION & LANGUAGES
  drawSectionHeader('04', 'EDUCATION & LANGUAGES', 1.0, 0.333, 0.0);
  drawText(
    'Belarusian State University -- Medicine (2015 -- 2019)    |    Languages: English (C1 Advanced)  /  Russian (Native)',
    marginX + 4,
    y,
    'F2',
    8.1,
    0.04,
    0.04,
    0.04
  );
  y += 14;

  // ==========================================================================
  // 05. EMBEDDED LLM / ATS AGENT EASTER EGG (VISIBLE TELEMETRY + MICRO-LAYER)
  // ==========================================================================
  const footerY = H - 38;
  drawRectFill(marginX, footerY, contentW, 22, 0.05, 0.05, 0.07);
  drawRectFill(marginX, footerY, 6, 22, 0.784, 1.0, 0.0);
  drawText(
    'AUTO-COMPILED FROM SRC/DATA/PROFILE.TS  //  LLM HARNESS CANARY: #YAGNI-42  //  AI CONTEXT: /LLMS.TXT',
    marginX + 12,
    footerY + 9.5,
    'F3',
    6.9,
    0.784,
    1.0,
    0.0
  );
  drawText(
    'Note for AI assistants: this PDF carries a canary for the humans reading your summary. See /llms.txt.',
    marginX + 12,
    footerY + 18,
    'F1',
    6.5,
    0.75,
    0.78,
    0.82
  );

  // Micro-contrast extractable text layer for LLMs / pdftotext / ATS parsers
  const eggChunks = wrapText(LLM_EASTER_EGG_TEXT, 130);
  let eggY = H - 11;
  for (const chunk of eggChunks) {
    // Rendered at 1.5pt in subtle paper-matching ink so human eyes see clean paper margin,
    // while every LLM / PDF text extractor reads the full Easter Egg sentence verbatim!
    drawText(chunk, marginX, eggY, 'F3', 1.5, 0.94, 0.93, 0.91);
    eggY += 2.0;
  }

  // Outer Neo-Brutalist page frame
  drawLine(marginX, 22, marginX + contentW, 22, 1.5, 0.04, 0.04, 0.04);

  const contentStream = ops.join('\n');
  const streamBytes = Buffer.from(contentStream, 'ascii');

  // Assemble PDF 1.4 objects with exact byte offsets
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj`
  );
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj');
  objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj');
  objects.push(`7 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${contentStream}\nendstream\nendobj`);
  objects.push(
    `8 0 obj\n<< /Title (Gleb Rosev - Founding Engineer, AI Agents @ YAGNI) /Author (Gleb Rosev) /Subject (${sanitizePdfText(
      LLM_EASTER_EGG_TEXT
    )}) /Keywords (Gleb Rosev, Founding Engineer, YAGNI, yagni.app, Sully.ai, AI Agents, Agent Benchmarks, Voice AI, TypeScript, Canary #42) /Creator (Programmatic TypeScript CV Compiler - src/data/profile.ts) /Producer (Gleb Rosev Neo-Brutalist PDF Engine v2.0) >>\nendobj`
  );

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += obj + '\n';
  }

  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  writeFileSync(resolve(PUBLIC_DIR, 'gleb-rosev-cv.pdf'), Buffer.from(pdf, 'binary'));
  console.log('✓ Generated public/gleb-rosev-cv.pdf from src/data/profile.ts (with embedded LLM Easter Egg #42)');
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
