// The full text of a post (BlogPost.body) as HTML: a small Markdown subset, enough for a long-form
// post and nothing a LinkedIn text can trip over. Blocks split on blank lines: "## " is a heading,
// lines that all start with "- " are a list, anything else is a paragraph (inner newlines become
// spaces). Inline: [text](https://…), **bold**, *italic*, `code`. Bodies come from the Publora
// sync too, so everything is escaped first and only http(s) links become links.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(raw: string): string {
  // Code spans first, so nothing inside them is formatted; they come back after the rest.
  const code: string[] = [];
  let s = esc(raw).replace(/`([^`]+)`/g, (_, c: string) => `\u0000${code.push(c) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="text-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${code[Number(i)]}</code>`);
}

export const bodyBlocks = (s: string) => s.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

export function bodyHtml(s: string): string {
  return bodyBlocks(s)
    .map((b) => {
      if (b.startsWith('## ')) return `<h2>${inline(b.slice(3).trim())}</h2>`;
      const lines = b.split('\n').map((l) => l.trim());
      if (lines.every((l) => l.startsWith('- '))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      return `<p>${inline(lines.join(' '))}</p>`;
    })
    .join('\n');
}
