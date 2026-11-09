// "Show more" on paged lists (/writing/, /how-its-built/). The button is a link to the next page,
// so it works without JS and crawlers follow it: <a data-more=".posts-grid" href="/writing/page/2/">.
// With JS the click fetches that page and appends the children of the list its data-more selector
// names to the same list here, then points the button at the page after it (or removes the
// button's [data-more-wrap] on the last page). The URL stays: a reload shows page 1 again, and
// the pager still links every page.
export function initShowMore() {
  document.addEventListener('click', async (e) => {
    const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-more]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const selector = link.dataset.more!;
    const list = document.querySelector<HTMLElement>(selector);
    if (!list) return;
    e.preventDefault();
    if (link.getAttribute('aria-busy') === 'true') return;
    link.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(link.href);
      if (!res.ok) throw new Error(String(res.status));
      const next = new DOMParser().parseFromString(await res.text(), 'text/html');
      const items = [...(next.querySelector(selector)?.children ?? [])].map((c) => document.importNode(c, true) as HTMLElement);
      if (!items.length) throw new Error('nothing to append');
      list.append(...items);
      // Keyboard and screen-reader users land on the first new item, not back at the button.
      items[0].querySelector<HTMLElement>('h2 a, h3 a, a')?.focus();
      const after = next.querySelector<HTMLAnchorElement>('a[data-more]');
      if (after) link.href = after.href;
      else (link.closest('[data-more-wrap]') ?? link).remove();
      document.dispatchEvent(new CustomEvent('site:more'));
    } catch {
      // Fall back to the plain link: open the next page.
      window.location.href = link.href;
    } finally {
      link.removeAttribute('aria-busy');
    }
  });
}
