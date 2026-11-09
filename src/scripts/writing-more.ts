// "Show more" on /writing/: the button is a link to the next page, so it works without JS and
// crawlers follow it. With JS the click fetches that page and appends its cards here instead,
// then points the button at the page after it (or removes it on the last page). The URL stays:
// a reload shows page 1 again, and the pager below still links every page.
export function initWritingMore() {
  const grid = document.querySelector<HTMLElement>('.posts-grid');
  if (!grid) return;

  document.addEventListener('click', async (e) => {
    const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-more]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (link.getAttribute('aria-busy') === 'true') return;
    link.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(link.href);
      if (!res.ok) throw new Error(String(res.status));
      const next = new DOMParser().parseFromString(await res.text(), 'text/html');
      const cards = [...next.querySelectorAll<HTMLElement>('.posts-grid > article.post-card')];
      if (!cards.length) throw new Error('no cards');
      grid.append(...cards.map((c) => document.importNode(c, true)));
      // Keyboard and screen-reader users land on the first new post, not back at the button.
      grid.querySelector<HTMLElement>(`article.post-card[data-slug="${CSS.escape(cards[0].dataset.slug ?? '')}"] .post-title a`)?.focus();
      const after = next.querySelector<HTMLAnchorElement>('a[data-more]');
      if (after) link.href = after.href;
      else link.closest('.writing-more')?.remove();
      document.dispatchEvent(new CustomEvent('site:more'));
    } catch {
      // Fall back to the plain link: open the next page.
      window.location.href = link.href;
    } finally {
      link.removeAttribute('aria-busy');
    }
  });
}
