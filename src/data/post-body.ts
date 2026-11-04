// The full text of a post (BlogPost.body) as HTML: a small Markdown subset, enough for a long-form
// post and nothing a LinkedIn text can trip over. A ``` fence is a code block, kept verbatim. The
// rest splits on blank lines: "## " is a heading, lines that all start with "- " are a list,
// anything else is a paragraph (inner newlines become spaces). Inline: [text](https://…), **bold**,
// *italic*, `code`. Bodies come from the Publora sync too, so everything is escaped first and only
// http(s) links become links.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
      if (b.startsWith('## ')) return `<h2>${inline(b.slice(3).trim())}</h2>`;
      const lines = b.split('\n').map((l) => l.trim());
      if (lines.every((l) => l.startsWith('- '))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      return `<p>${inline(lines.join(' '))}</p>`;
    })
    .join('\n');
}
