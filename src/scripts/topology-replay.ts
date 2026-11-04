// The hero topology's eager side: Explore, the phone Play button, the YAGNI case links, and when to
// load the PR #11 replay (src/scripts/replay/player.ts, a lazy chunk with the film, its data and the
// take-over rules). The film is not part of first paint: it loads after `load` and an idle moment,
// once the card is on screen; on phones only after Play. A click on the take-over controls before
// then loads it at once and is handed over.
import type { IsoApi } from './iso-engine';
import { trackOnce } from './analytics';
import { loadPlayer } from './replay/load-player';

type Controller = ReturnType<Awaited<ReturnType<typeof loadPlayer>>['startPlayer']>;

const DOMAINS = ['yagni', 'voice', 'saas'] as const;

// Both case links (the card's and the GR monogram bridge) open the case in place on a plain click.
// Modifier clicks stay the browser's (new tab/window), and middle clicks never reach `click`;
// the href (?case=yagni) opens the case on load, which also covers no-JS.
function openCase(e: MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (typeof window.openCaseBreakdown !== 'function') return;
  e.preventDefault();
  window.openCaseBreakdown('yagni');
}

export function initTopologyReplay(api: IsoApi | null): void {
  document.querySelectorAll<HTMLElement>('.nca-bridge a').forEach((a) => a.addEventListener('click', openCase));

  const cardEl = document.querySelector<HTMLElement>('.stage-iso-card');
  if (!cardEl || !api) return;
  const card: HTMLElement = cardEl;
  const $ = <T extends HTMLElement>(sel: string) => card.querySelector<T>(sel);
  $('[data-story-case]')?.addEventListener('click', openCase);
  const explore = $<HTMLButtonElement>('[data-story-explore]');
  const panel = document.getElementById('iso-explore');
  const play = $<HTMLButtonElement>('[data-story-play]');
  const poster = window.matchMedia('(max-width: 480px)');

  // ?domain=voice|saas is a free-play link: it applies when Explore first opens, not on load.
  const deepParam = new URLSearchParams(window.location.search).get('domain');
  let deepDomain = DOMAINS.find((d) => d === deepParam && d !== 'yagni') ?? null;

  let ctl: Controller | null = null;
  let loading: Promise<Controller | null> | null = null;
  const exploring = () => card.classList.contains('is-exploring');

  function start(): Promise<Controller | null> {
    if (play) play.hidden = true;
    window.playIso?.();
    loading ??= loadPlayer(document.documentElement.lang).then(
      (m) => {
        ctl = m.startPlayer({ api: api!, card, strings: m.strings, track: (p) => trackOnce('topology_interact', p) });
        if (exploring()) ctl.detach();
        return ctl;
      },
      () => null // no replay: the topology stays as the still overview, Explore still works
    );
    return loading;
  }

  // A take-over control used before the film loaded: load it now and hand the click over.
  card.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-sim-fault],[data-sim-judge],[data-replay-resume]');
      if (!el || ctl) return;
      e.stopImmediatePropagation();
      start().then((c) => c?.handle(el));
    },
    true
  );
  $('[data-replay-timeline]')?.addEventListener('focus', () => ctl || poster.matches || start());

  function setExplore(open: boolean) {
    explore?.setAttribute('aria-expanded', String(open));
    if (panel) panel.hidden = !open;
    card.classList.toggle('is-exploring', open);
    if (open) {
      if (play) play.hidden = true;
      ctl?.detach();
      window.playIso?.();
      if (deepDomain) {
        window.setIsoDomain(deepDomain, card.querySelector<HTMLElement>(`[data-iso-domain="${deepDomain}"]`));
        deepDomain = null;
      }
    } else if (ctl) ctl.attach();
    else start();
  }
  explore?.addEventListener('click', () => setExplore(explore.getAttribute('aria-expanded') !== 'true'));
  play?.addEventListener('click', () => (exploring() ? ((play.hidden = true), window.playIso?.()) : start()));

  // Rotating or resizing past phone width: no Play there, so start the film.
  poster.addEventListener?.('change', (e) => {
    if (!e.matches && !exploring()) start();
  });
  if (poster.matches) return;

  // Desktop: after load and an idle moment, once the card is (or comes) on screen.
  const whenVisible = () => {
    const r = card.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) return void start();
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      io.disconnect();
      start();
    });
    io.observe(card);
  };
  const idle = () =>
    'requestIdleCallback' in window ? requestIdleCallback(whenVisible, { timeout: 1200 }) : setTimeout(whenVisible, 300);
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}
