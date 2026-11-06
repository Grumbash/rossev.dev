// The site knows how you came, and says so once a visit. From the QR code on the phone case (its card
// at /c links on with ?from=case): we just met. From LinkedIn, by the referrer alone: on a post with
// its full text here, that this is the full text; anywhere else, hello. From /hire to the home page:
// start with the cases. The words are on the toast element (data-arrival-*), in the page's language.
// Nothing is tracked or kept beyond "already said" for this visit; ?from=case comes off the address,
// so a link copied from here does not say it came from the case.
export type Arrival = 'case' | 'linkedin' | 'linkedinPost' | 'hire';

export function arrival(at: { path: string; search: string; referrer: string; origin: string; fullPost: boolean }): Arrival | null {
  if (new URLSearchParams(at.search).get('from') === 'case') return 'case';
  let from: URL;
  try {
    from = new URL(at.referrer);
  } catch {
    return null;
  }
  if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(from.hostname)) return at.fullPost ? 'linkedinPost' : 'linkedin';
  if (from.origin === at.origin && /^(\/ru)?\/hire\/$/.test(from.pathname) && /^(\/ru)?\/$/.test(at.path)) return 'hire';
  return null;
}

const SAID = 'rosev_arrival';

export function initArrival() {
  const url = new URL(location.href);
  const how = arrival({
    path: url.pathname,
    search: url.search,
    referrer: document.referrer,
    origin: url.origin,
    fullPost: !!document.querySelector('.post-body'),
  });
  if (url.searchParams.get('from') === 'case') {
    url.searchParams.delete('from');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  const el = document.getElementById('brutal-toast');
  const text = how && el?.dataset[`arrival${how[0].toUpperCase()}${how.slice(1)}`];
  if (!el || !text) return;
  try {
    if (sessionStorage.getItem(SAID)) return;
    sessionStorage.setItem(SAID, how);
  } catch {
    // Without storage it may say it again on the next page of this visit; that is all.
  }
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}
