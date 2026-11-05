// The hero topology's eager side: Explore, the phone Play button, the YAGNI case links, and when to
// load the rest. Nothing here draws: the 3D engine (./iso-engine.ts) and the PR #11 replay
// (./replay/player.ts, with the film, its data and the take-over rules) are lazy chunks. The engine
// loads after `load` and an idle moment, or at once when the visitor touches the card; the replay
// follows once the card is on screen (on phones only after Play). The canvas box is reserved by CSS,
// so nothing moves when they arrive. A control used before then loads them and is handed over.
import type { IsoApi } from './iso-engine';
import { trackOnce } from './analytics';
import { loadEngine } from './load-engine';
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

export function initTopologyReplay(): void {
  document.querySelectorAll<HTMLElement>('.nca-bridge a').forEach((a) => a.addEventListener('click', openCase));

  const cardEl = document.querySelector<HTMLElement>('.stage-iso-card');
  if (!cardEl) return;
  const card: HTMLElement = cardEl;
  const $ = <T extends HTMLElement>(sel: string) => card.querySelector<T>(sel);
  $('[data-story-case]')?.addEventListener('click', openCase);
  const explore = $<HTMLButtonElement>('[data-story-explore]');
  const panel = document.getElementById('iso-explore');
  const play = $<HTMLButtonElement>('[data-story-play]');
  const timeline = $('[data-replay-timeline]');
  const poster = window.matchMedia('(max-width: 480px)');
  // Before the engine: BLUEPRINT on the YAGNI domain is the YAGNI case.
  window.openDomainBlueprint ??= () => window.openCaseBreakdown?.('yagni');
  // A phone's poster has no film until Play: no dead stop in the tab order.
  if (poster.matches && timeline) timeline.tabIndex = -1;

  // ?domain=voice|saas is a free-play link: it applies when Explore first opens, not on load.
  const deepParam = new URLSearchParams(window.location.search).get('domain');
  let deepDomain = DOMAINS.find((d) => d === deepParam && d !== 'yagni') ?? null;

  let api: Promise<IsoApi | null> | null = null;
  let ctl: Controller | null = null;
  let loading: Promise<Controller | null> | null = null;
  const exploring = () => card.classList.contains('is-exploring');

  const engine = () =>
    (api ??= loadEngine().then(
      (m) => m.initIsoArchitectureEngine(),
      () => null
    ));

  function start(): Promise<Controller | null> {
    if (play) play.hidden = true;
    if (timeline) timeline.tabIndex = 0;
    loading ??= Promise.all([engine(), loadPlayer(document.documentElement.lang)]).then(
      ([iso, m]) => {
        if (!iso) throw new Error('no engine');
        window.playIso?.();
        ctl = m.startPlayer({ api: iso, card, strings: m.strings, track: (p) => trackOnce('topology_interact', p) });
        if (exploring()) ctl.detach();
        return ctl;
      },
      () => null
    ).then((c) => {
      // No replay: the take-over controls would do nothing. The overview and Explore stay.
      if (!c) card.querySelectorAll<HTMLElement>('[data-sim-fault],[data-sim-judge],.replay-bar').forEach((el) => (el.hidden = true));
      return c;
    });
    return loading;
  }

  // The page morphed into the other language (scripts/lang-morph.ts): a running film follows it.
  document.addEventListener('site:lang', (e) => {
    const lang = (e as CustomEvent<{ lang: string }>).detail.lang;
    if (ctl) loadPlayer(lang).then((m) => ctl?.setLang(lang === 'ru' ? 'ru' : 'en', m.strings));
  });

  // A take-over control or the timeline used before the film loaded: load it and hand the input over.
  card.addEventListener(
    'click',
    (e) => {
      if (ctl) return;
      const el = (e.target as Element).closest<HTMLElement>('[data-sim-fault],[data-sim-judge],[data-replay-resume],[data-replay-pause],[data-replay-timeline]');
      if (!el) return;
      e.stopImmediatePropagation();
      const x = (e as MouseEvent).clientX;
      start().then((c) => c?.handle(el, x));
    },
    true
  );
  timeline?.addEventListener('keydown', (e) => {
    if (ctl || !/^(Arrow|Home|End| )/.test(e.key)) return;
    e.preventDefault();
    start().then((c) => c?.key(e.key));
  });
  // Any touch of the card wants the engine now (a drag, a hover over a node, a focus).
  for (const type of ['pointerdown', 'focusin', 'pointerenter']) card.addEventListener(type, engine, { once: true });

  function setExplore(open: boolean) {
    explore?.setAttribute('aria-expanded', String(open));
    if (panel) panel.hidden = !open;
    card.classList.toggle('is-exploring', open);
    if (open) {
      if (play) play.hidden = true;
      ctl?.detach();
      engine().then(() => {
        window.playIso?.();
        if (deepDomain && exploring()) {
          window.setIsoDomain(deepDomain, card.querySelector<HTMLElement>(`[data-iso-domain="${deepDomain}"]`));
          deepDomain = null;
        }
      });
    } else if (ctl) ctl.attach();
    else start();
  }
  explore?.addEventListener('click', () => setExplore(explore.getAttribute('aria-expanded') !== 'true'));
  play?.addEventListener('click', () => {
    if (!exploring()) return void start();
    play.hidden = true;
    engine().then(() => window.playIso?.());
  });

  // Rotating or resizing past phone width: no Play there, so start the film.
  poster.addEventListener?.('change', (e) => {
    if (!e.matches && !exploring()) start();
  });

  // After load and an idle moment: the engine (a phone's still poster), and on wider screens the
  // film too, once the card is (or comes) on screen.
  const whenVisible = () => {
    engine();
    if (poster.matches) return;
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
