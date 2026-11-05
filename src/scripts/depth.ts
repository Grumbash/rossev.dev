// The depth dial on a technical post: "for people" melts the post into its plain-language version
// (the <template data-depth-plain> PostBrief.astro renders), "for engineers" back into the post as
// written. Same melt as the language switch (scripts/lang-morph.ts, loaded on the first switch).
// The choice is a per-visitor convenience in localStorage: it holds across posts, visits and the
// language switch, which swaps in the other language's post and template and fires site:lang.
const KEY = 'rosev_depth';
type Depth = 'plain' | 'engineers';

export function initDepth() {
  const dial = document.querySelector<HTMLElement>('[data-depth-dial]');
  const body = document.querySelector('.post-body');
  const plain = () => document.querySelector<HTMLTemplateElement>('template[data-depth-plain]')?.innerHTML ?? '';
  if (!dial || !body || !plain()) return;

  let asWritten = body.innerHTML;
  let depth: Depth = 'engineers';
  const show = (d: Depth) => {
    depth = d;
    for (const b of dial.querySelectorAll<HTMLElement>('[data-depth-to]')) b.setAttribute('aria-pressed', String(b.dataset.depthTo === d));
  };

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {}
  if (stored === 'plain') {
    body.innerHTML = plain();
    show('plain');
  }
  dial.hidden = false;

  dial.addEventListener('click', (e) => {
    const to = (e.target as Element).closest<HTMLElement>('[data-depth-to]')?.dataset.depthTo as Depth | undefined;
    if (!to || to === depth) return;
    show(to);
    try {
      localStorage.setItem(KEY, to);
    } catch {}
    const html = to === 'plain' ? plain() : asWritten;
    import('./lang-morph')
      .then((m) => m.meltRegion(body, html))
      .catch(() => (body.innerHTML = html));
  });

  // The language switch put the other language's post in place (inside its own melt): keep it as
  // the "as written" text and, for "for people", show the plain version instead.
  document.addEventListener('site:lang', () => {
    asWritten = body.innerHTML;
    if (depth === 'plain') body.innerHTML = plain();
  });
}
