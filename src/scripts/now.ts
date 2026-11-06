// "Gleb now", the footer line: his time in Tbilisi (from midnight to seven, probably asleep) and the
// site's last commit, how long ago. The build writes the commit (src/data/now.ts), so without JS the
// line names it with its date. Once the footer is in view, GitHub's public API is asked for a newer
// one: a plain GET with nothing of the visitor's in it. The words are on the row (data-now-*), in the
// page's language; the clock is a script-made node the language morph leaves alone.
const TZ = 'Asia/Tbilisi';
const API = 'https://api.github.com/repos/Grumbash/rossev.dev/commits/main';

export function clock(at: Date) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  return { time, night: Number(time.slice(0, 2)) < 7 };
}

export function ago(ms: number, lang: string, justNow: string) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return justNow;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'always' });
  if (min < 60) return rtf.format(-min, 'minute');
  if (min < 24 * 60) return rtf.format(-Math.floor(min / 60), 'hour');
  return rtf.format(-Math.floor(min / (24 * 60)), 'day');
}

export function initNow() {
  const row = document.querySelector<HTMLElement>('[data-now]');
  const when = row?.querySelector('time');
  const link = row?.querySelector('a');
  const dd = row?.querySelector('dd');
  if (!row || !when || !link || !dd) return;
  let commit = { at: when.dateTime, href: link.href, subject: link.textContent ?? '' };

  const span = document.createElement('span');
  span.setAttribute('data-morph-ignore', '');
  const render = () => {
    const w = row.dataset;
    const { time, night } = clock(new Date());
    span.textContent = `${(night ? w.nowNight : w.nowTime)?.replace('{t}', time) ?? time} · `;
    if (!span.isConnected) dd.prepend(span);
    when.dateTime = commit.at;
    when.textContent = ago(Date.now() - Date.parse(commit.at), document.documentElement.lang, w.nowJustNow ?? '');
    link.href = commit.href;
    link.textContent = commit.subject;
  };
  render();
  setInterval(render, 30_000);
  document.addEventListener('site:lang', render);

  new IntersectionObserver((seen, io) => {
    if (!seen.some((e) => e.isIntersecting)) return;
    io.disconnect();
    fetch(API)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        const at = c?.commit?.committer?.date;
        if (!at || Date.parse(at) <= Date.parse(commit.at)) return;
        commit = { at, href: c.html_url, subject: String(c.commit.message).split('\n')[0] };
        render();
      })
      .catch(() => {});
  }).observe(row);
}
