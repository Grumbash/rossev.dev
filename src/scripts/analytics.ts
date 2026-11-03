// Funnel analytics: Umami Cloud custom events (Vercel Hobby has pageviews only).
// Markup opts in with data-track="<event>" plus data-track-<prop>="<value>";
// one delegated listener sends them, so HTMX-swapped partials work too.
import { PROFILE } from '../data/profile';

// Every event and its props (max 2). Add a control here before tagging it.
export const EVENTS = {
  // cal.com link clicked. placement: nav|hero|footer|reader; lang: page language at click time
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
  // including via the topology BLUEPRINT button, which also sends topology_interact{blueprint}. id: case study id
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
  // Topology used, once per action per page view.
  // action: domain|fault|xray|reset|packet|stratum|step|blueprint, or drag (horizontal drag on the canvas)
  topology_interact: ['action'],
  // GR monogram (neural cellular automaton) used, once per action per page view.
  // action: drag (pointer erase) | key (Enter/Space bite) | reset
  nca_interact: ['action'],
  // Language switch to a different language. to: en|ru
  lang_switch: ['to'],
  // Theme toggle. to: light|dark (read after the toggle)
  theme_switch: ['to'],
  // Home section scrolled into view, once per page view. section: experience|writing|contact
  // (every page renders the #contact footer; only home reports, see data-page in Base.astro)
  section_view: ['section'],
} as const;

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

export function calUrl(placement: 'nav' | 'hero' | 'footer' | 'reader'): string {
  const url = new URL(PROFILE.calendar);
  url.searchParams.set('utm_source', 'rossev.dev');
  url.searchParams.set('utm_medium', 'site');
  url.searchParams.set('utm_content', placement);
  return url.toString();
}

export function initAnalytics(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Capture phase runs before the element's onclick, so this is the language before the click.
  let langBefore: string | null = null;
  document.addEventListener('click', () => (langBefore = root.getAttribute('data-lang')), true);

  // Bubble phase on document: runs after the element's own onclick handler.
  const onClick = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-track]');
    const ev = el && eventFromDataset(el.dataset);
    if (!ev) return;
    // EN while already on EN is not a switch.
    if (ev.name === 'lang_switch' && ev.props?.to === langBefore) return;
    if (ev.name === 'cta_book') track(ev.name, { ...ev.props, lang: root.getAttribute('data-lang') || 'en' });
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
