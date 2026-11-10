// The full text of a post (BlogPost.body) as HTML: a small Markdown subset, enough for a long-form
// post and nothing a LinkedIn text can trip over. A ``` fence is a code block, kept verbatim. The
// rest splits on blank lines: "## " is a heading; inside a block, two or more lines in a row that
// start with "- ", "* " or "— " are a list, "1. " or "1) " a numbered list (a tab after the marker
// counts too), and the other lines a paragraph (inner newlines become spaces). Inline: [text](https://…), **bold**,
// *italic*, `code`. Bodies come from the Publora sync too, so everything is escaped first and only
// http(s) links become links.

import { readFileSync } from 'node:fs';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Build-time SVG dimensions reserve space before a lazy image arrives.
function dimensions(src: string): string {
  if (!src.endsWith('.svg')) return '';
  try {
    const header = readFileSync(`public${src}`, 'utf8').match(/<svg\b[^>]*>/)?.[0] ?? '';
    const box = header.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (box && Number(box[1]) > 0 && Number(box[2]) > 0)
      return ` width="${Math.round(Number(box[1]) * 100)}" height="${Math.round(Number(box[2]) * 100)}"`;
  } catch { /* A missing draft asset remains visible as a broken image. */ }
  return '';
}

function inline(raw: string): string {
  // Code spans first, so nothing inside them is formatted; they come back after the rest.
  const code: string[] = [];
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c: string) => `\u0000${code.push(c) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="text-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${code[Number(i)]}</code>`);
}

const FENCE = /^```[\w-]*\n([\s\S]*?)\n```$/gm;

/** Top-level blocks: each code fence whole (blank lines inside it included), the rest split on blank lines. */
export function bodyBlocks(s: string): string[] {
  const out: string[] = [];
  let at = 0;
  const prose = (t: string) => out.push(...t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean));
  for (const m of s.matchAll(FENCE)) {
    prose(s.slice(at, m.index));
    out.push(m[0]);
    at = m.index! + m[0].length;
  }
  prose(s.slice(at));
  return out;
}

export function bodyHtml(s: string): string {
  return bodyBlocks(s)
    .map((b) => {
      if (b.startsWith('```')) return `<pre><code>${esc(b.replace(/^```[\w-]*\n/, '').replace(/\n```$/, ''))}</code></pre>`;
      // Only local article assets: remote images and arbitrary HTML stay escaped.
      const image = b.match(/^!\[([^\]\n]+)\]\((\/articles\/[a-z0-9-]+\/[a-z0-9-]+\.(?:svg|png|webp))\)$/);
      if (image) return `<figure><img src="${image[2]}" alt="${esc(image[1])}"${dimensions(image[2])} loading="lazy" decoding="async" style="display:block;width:100%;height:auto;background:#fff"><figcaption>${esc(image[1])}</figcaption></figure>`;
      if (b.startsWith('## ')) return `<h2>${inline(b.slice(3).trim())}</h2>`;
      return lineRuns(b.split('\n').map((l) => l.trim()).filter(Boolean));
    })
    .join('\n');
}

// LinkedIn posts put a list right under its lead-in line, with no blank line between them
// ("The result:\n- one\n- two"). So a block is read line by line: a run of list lines is a list,
// the prose around it a paragraph. One marker line inside prose stays prose; a block that is
// nothing but marker lines is a list even when it is one line long.
// LinkedIn exports often put a tab after the marker ("1.\tThe office effect.").
const BULLET = /^[-*—][ \t]+/;
const NUMBER = /^(\d+)[.)][ \t]+/;

function lineRuns(lines: string[]): string {
  const kind = (l: string) => (BULLET.test(l) ? 'ul' : NUMBER.test(l) ? 'ol' : 'p');
  const runs: { kind: string; lines: string[] }[] = [];
  for (const l of lines) {
    const k = kind(l);
    const last = runs[runs.length - 1];
    if (last && last.kind === k) last.lines.push(l);
    else runs.push({ kind: k, lines: [l] });
  }
  // A lone marker line among prose ("- a" followed by "not a list") joins the prose around it.
  const merged: { kind: string; lines: string[] }[] = [];
  for (const r of runs) {
    const k = r.kind !== 'p' && r.lines.length < 2 && runs.length > 1 ? 'p' : r.kind;
    const last = merged[merged.length - 1];
    if (last && last.kind === 'p' && k === 'p') last.lines.push(...r.lines);
    else merged.push({ kind: k, lines: [...r.lines] });
  }
  return merged
    .map((r) => {
      if (r.kind === 'p') return `<p>${inline(r.lines.join(' '))}</p>`;
      const marker = r.kind === 'ul' ? BULLET : NUMBER;
      const start = r.kind === 'ol' ? Number(r.lines[0].match(NUMBER)![1]) : 1;
      const open = r.kind === 'ol' && start !== 1 ? `<ol start="${start}">` : `<${r.kind}>`;
      return `${open}${r.lines.map((l) => `<li>${inline(l.replace(marker, ''))}</li>`).join('')}</${r.kind}>`;
    })
    .join('\n');
}
