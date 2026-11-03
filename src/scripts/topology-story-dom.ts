// Wires the hero topology's guided story (state in topology-story.ts) to the card and the engine.
// Runs after initIsoArchitectureEngine, which puts focusIsoNode / fireIsoPacket / ... on window.
import { trackOnce } from './analytics';
import {
  START,
  STEP_FOCUS,
  aborted,
  arrivalAction,
  breakAndHeal,
  caseVisible,
  go,
  healed,
  type StoryState,
} from './topology-story';

const RESOLVED = 'INCIDENT RESOLVED · ZERO CUSTOMER IMPACT';
const DOMAINS = ['yagni', 'voice', 'saas'] as const;
type Domain = (typeof DOMAINS)[number];

// Both case links (the story's last step and the GR monogram bridge) open the case in place on a plain click.
// Modifier clicks stay the browser's (new tab/window), and middle clicks never reach `click`;
// the href (?case=yagni) opens the case on load, which also covers no-JS.
function openCase(e: MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (typeof window.openCaseBreakdown !== 'function') return;
  e.preventDefault();
  window.openCaseBreakdown('yagni');
}

export function initTopologyStory(): void {
  document.querySelectorAll<HTMLElement>('.nca-bridge a').forEach((a) => a.addEventListener('click', openCase));

  const cardEl = document.querySelector<HTMLElement>('.stage-iso-card');
  if (!cardEl || typeof window.focusIsoNode !== 'function') return;
  const card: HTMLElement = cardEl;
  const $ = <T extends HTMLElement>(sel: string) => card.querySelector<T>(sel);
  const captions = card.querySelectorAll<HTMLElement>('[data-story-step]');
  const caseLink = $<HTMLAnchorElement>('[data-story-case]');
  const live = $('[data-story-live]');
  const prev = $<HTMLButtonElement>('[data-story-prev]');
  const next = $<HTMLButtonElement>('[data-story-next]');
  const brk = $<HTMLButtonElement>('[data-story-break]');
  const count = $('[data-story-count]');
  const explore = $<HTMLButtonElement>('[data-story-explore]');
  const panel = document.getElementById('iso-explore');
  const play = $<HTMLButtonElement>('[data-story-play]');
  const status = document.getElementById('iso-trace-status');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const poster = window.matchMedia('(max-width: 480px)');

  // ?domain=voice|saas is a free-play link: it applies when Explore first opens, not on load.
  const deepParam = new URLSearchParams(window.location.search).get('domain');
  let deepDomain = DOMAINS.find((d) => d === deepParam && d !== 'yagni') ?? null;

  let s: StoryState = START;
  let started = false; // the canvas has been staged and is animating

  const exploring = () => card.classList.contains('is-exploring');
  const visible = (el: HTMLElement | null) => !!el && !el.hidden && !(el as HTMLButtonElement).disabled;

  function paint(announce = true) {
    const focused = document.activeElement as HTMLElement | null;
    const showCase = caseVisible(s);
    captions.forEach((c) => c.classList.toggle('is-current', !showCase && c.dataset.storyStep === String(s.step)));
    caseLink?.classList.toggle('is-current', showCase);
    if (count) count.textContent = `${s.step}/3`;
    if (prev) prev.disabled = s.step === 1;
    if (next) next.hidden = s.step === 3;
    if (brk) {
      brk.hidden = s.step !== 3 || s.healed;
      // aria-disabled, not disabled: a disabled button drops keyboard focus mid-run.
      brk.setAttribute('aria-disabled', String(s.healing));
    }

    // The control that had focus just went away: hand focus to the one that replaced it.
    const gone = focused && (focused === caseLink ? !showCase : [prev, next, brk].includes(focused as HTMLButtonElement) && !visible(focused));
    if (gone) (showCase ? caseLink : visible(brk) ? brk : next)?.focus();

    if (announce && live) {
      const current = showCase ? caseLink : card.querySelector(`[data-story-step="${s.step}"]`);
      live.textContent = current?.textContent?.trim() ?? '';
    }
  }

  // Point the canvas at this step's node; the story is about the YAGNI system only.
  function stage() {
    started = true;
    if (play) play.hidden = true;
    window.playIso?.();
    if (window.getIsoDomain?.() !== 'yagni') window.setIsoDomain('yagni');
    const f = STEP_FOCUS[s.step];
    window.focusIsoNode(f.node);
    if (f.trace) window.fireIsoPacket();
    if (status) status.textContent = `STEP ${s.step}/3`;
  }

  function step(dir: 1 | -1) {
    const from = s;
    s = go(s, dir);
    if (s === from) return;
    // Leaving step 3 mid-run: stop the fault, or its STAGE x/5 status would narrate over step 2.
    if (from.healing) window.clearIsoFault();
    const action = arrivalAction(from, s);
    if (action) trackOnce('topology_interact', { action });
    stage();
    paint();
  }

  prev?.addEventListener('click', () => step(-1));
  next?.addEventListener('click', () => step(1));

  // The engine's own fault (F key on the canvas, the dossier's BREAK & HEAL) goes through the story
  // outside Explore, so it can't run a fault the story doesn't know about.
  const engineFault = window.triggerIsoFault;
  function breakIt() {
    const from = s;
    s = breakAndHeal(s, reducedMotion);
    if (s === from) return;
    if (s.healing) {
      stage();
      engineFault(true);
    } else if (status) {
      // Reduced motion: no fault animation to wait for, straight to the outcome.
      status.textContent = RESOLVED;
    }
    paint();
  }
  window.triggerIsoFault = (keepFocus = false) => {
    if (exploring()) engineFault(keepFocus);
    else if (s.step === 3) breakIt();
  };
  brk?.addEventListener('click', breakIt);

  window.addEventListener('iso:healed', () => {
    const before = s;
    s = healed(s);
    if (s !== before) paint();
  });
  // A domain switch (or stepping away) killed the run before it healed.
  window.addEventListener('iso:aborted', () => {
    const before = s;
    s = aborted(s);
    if (s !== before) paint();
  });

  caseLink?.addEventListener('click', openCase);

  function setExplore(open: boolean) {
    explore?.setAttribute('aria-expanded', String(open));
    if (panel) panel.hidden = !open;
    card.classList.toggle('is-exploring', open);
    if (open) {
      if (play) play.hidden = true;
      started = true;
      window.playIso?.();
      if (deepDomain) {
        window.setIsoDomain(deepDomain, card.querySelector<HTMLElement>(`[data-iso-domain="${deepDomain}"]`));
        deepDomain = null;
      }
    } else {
      // Back to the story where it was: YAGNI and the current step's node.
      stage();
    }
  }
  explore?.addEventListener('click', () => setExplore(explore.getAttribute('aria-expanded') !== 'true'));

  play?.addEventListener('click', () => {
    if (exploring()) {
      play.hidden = true;
      window.playIso?.();
    } else stage();
  });

  // Rotating or resizing past phone width: no Play there, so stage the story once (the engine starts its loop).
  poster.addEventListener?.('change', (e) => {
    if (!e.matches && !started && !exploring()) stage();
  });

  // Desktop opens on step 1's node. A phone keeps the still overview until Play.
  if (!poster.matches) stage();
  paint(false);
}
