// Home's architecture breakdowns (<details class="job-case">) hold only a link to /cases/<id>/
// until opened; the first open fetches the breakdown from data-case-src (/partials/case-<id>).
// Also owns window.openCaseBreakdown (topology, story and monogram links) and ?case=<id> on load.
type FetchLike = (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>;

export function initCaseLoader(fetchFn: FetchLike = (url) => fetch(url)) {
  const loads = new WeakMap<HTMLDetailsElement, { src: string; promise: Promise<void> }>();

  // One request per case; a failed one keeps the link and is retried on the next open.
  const load = (d: HTMLDetailsElement): Promise<void> => {
    const src = d.dataset.caseSrc;
    const pending = loads.get(d);
    if (pending && pending.src === src) return pending.promise;
    const body = d.querySelector<HTMLElement>('[data-case-body]');
    if (!src || !body) return Promise.resolve();
    const p = fetchFn(src)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((html) => {
        if (loads.get(d)?.promise === p && d.dataset.caseSrc === src) body.innerHTML = html;
      })
      .catch(() => {
        if (loads.get(d)?.promise === p) loads.delete(d);
      });
    loads.set(d, { src, promise: p });
    return p;
  };

  // A language change updates data-case-src while an earlier response may still be in flight.
  document.addEventListener('site:lang', () => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>('.job-case')) if (d.open) load(d);
  });

  // Scroll once the breakdown is in, so the layout it adds does not push the case off screen.
  window.openCaseBreakdown = (caseId: string) => {
    const d = document.getElementById('case-' + caseId) as HTMLDetailsElement | null;
    if (!d) return;
    d.open = true;
    load(d).then(() => setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120));
  };

  // `toggle` does not bubble, so listen in the capture phase. Keeps ?case= in step with the open case.
  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target as HTMLDetailsElement;
      if (!d.classList?.contains('job-case')) return;
      const caseId = d.id.replace('case-', '');
      if (d.open) {
        load(d);
        window.setUrlParam?.('case', caseId);
      } else if (new URLSearchParams(window.location.search).get('case') === caseId) {
        window.setUrlParam?.('case', null);
      }
    },
    true,
  );

  const restore = () => {
    const caseParam = new URLSearchParams(window.location.search).get('case');
    if (caseParam && /^[a-z]+$/.test(caseParam)) window.openCaseBreakdown(caseParam);
  };
  // After every module has run (analytics must be listening to skip this auto-open in case_open).
  if (document.readyState === 'complete') restore();
  else document.addEventListener('DOMContentLoaded', restore);
}
