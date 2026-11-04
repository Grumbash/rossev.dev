// Funnel analytics: Umami Cloud custom events (Vercel Hobby has pageviews only).
// Markup opts in with data-track="<event>" plus data-track-<prop>="<value>";
// one delegated listener sends them, so HTMX-swapped partials work too.
import { PROFILE } from '../data/profile';

// Every event and its props (max 2). Add a control here before tagging it.
export const EVENTS = {
  // cal.com link clicked. placement: nav|hero|footer|reader|build-story; lang: page language at click time
  cta_book: ['placement', 'lang'],
  // "copy email" button. placement: hero|footer
  email_copy: ['placement'],
  // mailto: link. placement: hero|footer
  email_click: ['placement'],
  // CV PDF link. placement: hero|footer
  cv_download: ['placement'],
  // LinkedIn profile link. placement: hero|writing|footer|reader
  linkedin_click: ['placement'],
  // A job's architecture case (<details class="job-case">) opened by the visitor (not the ?case= auto-open on load),
  // including via the topology BLUEPRINT button (also sends topology_interact{blueprint}), the topology card's YAGNI case link
  // (also topology_interact{case}) and the GR monogram bridge link (also nca_interact{case}). id: case study id
  case_open: ['id'],
  // Toolbox skill clicked to highlight jobs. skill: the skill name
  skill_click: ['skill'],
  // Toolbox "copy as text"
  toolbox_copy: [],
  // Post opened from a home card or a reader's "Next" (inline reader or post page): inline on a plain click on home,
  // otherwise its page (post-page Next, modifier/middle click). id: post id
  post_open: ['id'],
  // Post's LinkedIn original opened (grid card or reader). id: post id
  post_linkedin: ['id'],
  // Writing filter tab. filter: all|ai|leadership|systems|delivery
  post_filter: ['filter'],
  // Topology used, once per action per page view (per action and outcome for outcomes).
  // action: domain|fault|xray|reset|packet|stratum|step|blueprint (free play, behind Explore),
  // drag (horizontal drag on the canvas), case|play|explore (YAGNI case link, phone Play, Explore toggle),
  // and the PR #11 replay: replay|takeover|resume|scrub (the film first started, the visitor took over,
  // the film came back (Resume or by itself), a timeline stop used) and outcome, with
  // outcome: caught|shipped|recovered|failed for a fault run of the learned policy on the toy service (caught
  // before merge, shipped with the judge off, recovered, or it could not keep up), and of the whole set
  // caught|shipped|healed|unhealed the last two are the visitor's cut on the mini GR regrown by the real model, or not
  topology_interact: ['action', 'outcome'],
  // nca_interact: GR monogram (neural cellular automaton) used, once per action per page view.
  // action: drag (pointer erase) | key (Enter/Space bite) | reset | case (bridge link to the YAGNI case)
  nca_interact: ['action'],
  // Voice demo in the Sully case ("Say hello"), sent by src/scripts/vad/loader.ts on a state change.
  // action: start (clicked, mic asked) | denied | detected | error (no mic, unsupported browser, failed load);
  // ms: detected only, bucket of the onset latency <100|100-199|200-399|400-799|800+
  vad_demo: ['action', 'ms'],
  // Language switch to a different language. to: en|ru
  lang_switch: ['to'],
  // Theme toggle. to: light|dark (read after the toggle)
  theme_switch: ['to'],
  // Home section scrolled into view, once per page view. section: experience|writing|contact
  // (every page renders the #contact footer; only home reports, see data-page in Base.astro)
  section_view: ['section'],
  // A call booked on cal.com: fires once on /booked after a redirect that carries a uid.
  // source: nav|hero|footer|reader|build-story (the cal.com link's utm_content) | unknown
  booking_confirmed: ['source'],
} as const;

// Where a cal.com link sits. calUrl() tags links with it; /booked reads it back.
export const PLACEMENTS = ['nav', 'hero', 'footer', 'reader', 'build-story'] as const;
export type Placement = (typeof PLACEMENTS)[number];

export type EventName = keyof typeof EVENTS;
type Props = Record<string, string>;

declare global {
  interface Window {
    umami?: { track: (name: string, data?: Record<string, string | number | boolean>) => void };
  }
}

export function track(name: EventName, props?: Props): void {
  if (typeof window === 'undefined') return;
  try {
    if (props) window.umami?.track(name, props);
    else window.umami?.track(name);
  } catch {
    // A blocked or broken tracker must never break the page.
  }
}

const sent = new Set<string>();
export function trackOnce(name: EventName, props?: Props): void {
  const key = name + JSON.stringify(props ?? {});
  if (sent.has(key)) return;
  sent.add(key);
  track(name, props);
}

// { track: 'post_open', trackId: 'post-3' } -> { name: 'post_open', props: { id: 'post-3' } }
// Only props declared in EVENTS[name] are forwarded.
export function eventFromDataset(dataset: Record<string, string | undefined>): { name: EventName; props?: Props } | null {
  const name = dataset.track;
  if (!name || !(name in EVENTS)) return null;
  const props: Props = {};
  for (const prop of EVENTS[name as EventName] as readonly string[]) {
    const value = dataset['track' + prop.charAt(0).toUpperCase() + prop.slice(1)];
    if (value !== undefined) props[prop] = value;
  }
  return { name: name as EventName, props: Object.keys(props).length ? props : undefined };
}

// `lang`: the page's locale, when not English. cal.com forwards it to /booked/, which sends the
// visitor on to the confirmation page in their language (/ru/booked/).
export function calUrl(placement: Placement, lang = 'en'): string {
  const url = new URL(PROFILE.calendar);
  url.searchParams.set('utm_source', 'rossev.dev');
  url.searchParams.set('utm_medium', 'site');
  url.searchParams.set('utm_content', placement);
  if (lang !== 'en') url.searchParams.set('lang', lang);
  return url.toString();
}

// /booked query -> the placement of the link that led to the booking. null: no new booking, i.e. no uid
// (a reload, a typed URL) or a reschedule (cal.com forwards the booking page's rescheduleUid).
// Reads only uid, rescheduleUid and utm_content; everything else cal.com forwards (email, name, phone...) is ignored.
// Self-contained: booked.astro inlines its source into a <head> script and declares PLACEMENTS next to it.
export function bookingSource(search: string, placements: readonly string[] = PLACEMENTS): Placement | 'unknown' | null {
  const q = new URLSearchParams(search);
  if (!q.get('uid') || q.get('rescheduleUid')) return null;
  const content = q.getAll('utm_content');
  const same = content.length > 0 && content.every((c) => c === content[0]);
  return same && placements.indexOf(content[0]) >= 0 ? (content[0] as Placement) : 'unknown';
}

export function initAnalytics(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Set by the /booked head script; the attribute is page-writable, so only a known placement goes out.
  const booked = root.getAttribute('data-booking-source');
  if (booked !== null) {
    track('booking_confirmed', { source: (PLACEMENTS as readonly string[]).includes(booked) ? booked : 'unknown' });
  }

  // Capture phase runs before the data-action handler, so this is the language before the click.
  let langBefore: string | null = null;
  document.addEventListener('click', () => (langBefore = root.getAttribute('lang')), true);

  // Bubble phase on document, registered after initActions: runs after the data-action handler.
  const onClick = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-track]');
    const ev = el && eventFromDataset(el.dataset);
    if (!ev) return;
    // EN while already on EN is not a switch.
    if (ev.name === 'lang_switch' && ev.props?.to === langBefore) return;
    if (ev.name === 'cta_book') track(ev.name, { ...ev.props, lang: root.getAttribute('lang') || 'en' });
    else if (ev.name === 'theme_switch') track(ev.name, { to: root.getAttribute('data-theme') || 'light' });
    else if (ev.name === 'topology_interact' || ev.name === 'nca_interact') trackOnce(ev.name, ev.props);
    else track(ev.name, ev.props);
  };
  document.addEventListener('click', onClick);
  // Middle-click opens links in a new tab without firing `click`; on a button it does nothing.
  document.addEventListener('auxclick', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-track]');
    if ((e as MouseEvent).button === 1 && el?.closest('a[href]')) onClick(e);
  });

  // `toggle` does not bubble, so listen in the capture phase.
  // The case auto-opened by a ?case=<id> deep link on load is not a visitor's open.
  let deepLinkedCase = new URLSearchParams(window.location?.search ?? '').get('case');
  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target as HTMLDetailsElement;
      if (!d.classList?.contains('job-case') || !d.open) return;
      const id = d.id.replace('case-', '');
      if (id === deepLinkedCase) {
        deepLinkedCase = null;
        return;
      }
      track('case_open', { id });
    },
    true,
  );

  // Drag = a horizontal move while the pointer is down; taps and vertical touch scrolls don't count.
  const canvas = document.getElementById('iso-arch-canvas');
  let start: { x: number; y: number } | null = null;
  canvas?.addEventListener('pointerdown', (e) => (start = { x: e.clientX, y: e.clientY }));
  canvas?.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    if (dx > 10 && dx > Math.abs(e.clientY - start.y)) trackOnce('topology_interact', { action: 'drag' });
  });
  canvas?.addEventListener('pointerup', () => (start = null));
  canvas?.addEventListener('pointercancel', () => (start = null));
  canvas?.addEventListener('pointerleave', () => (start = null));

  // A section counts once its top has passed 60% of the viewport height (works for tall sections on phones).
  // Base.astro marks <html data-page="home|writing">; unmarked markup counts as home.
  const page = root.getAttribute('data-page');
  if (typeof IntersectionObserver === 'undefined' || (page && page !== 'home')) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) trackOnce('section_view', { section: entry.target.id });
    },
    { rootMargin: '0px 0px -40% 0px' },
  );
  for (const id of ['experience', 'writing', 'contact']) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
}
