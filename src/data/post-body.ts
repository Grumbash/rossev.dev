// The full text of a post (BlogPost.body) as HTML: a small Markdown subset, enough for a long-form
// post and nothing a LinkedIn text can trip over. A ``` fence is a code block, kept verbatim. The
// rest splits on blank lines: "## " is a heading, lines that all start with "- " are a list,
// anything else is a paragraph (inner newlines become spaces). Inline: [text](https://…), **bold**,
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
      const lines = b.split('\n').map((l) => l.trim());
      if (lines.every((l) => l.startsWith('- '))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      return `<p>${inline(lines.join(' '))}</p>`;
    })
    .join('\n');
}
