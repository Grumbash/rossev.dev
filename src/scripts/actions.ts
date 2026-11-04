// Click handlers without inline onclick="" (the CSP allows no inline script): markup names an
// action in data-action, plus data-arg where the action takes one, and one delegated listener calls
// it. Only the actions listed here can be called. Registered before initAnalytics, so on document
// it runs before the data-track listener, as the element's own onclick did.
type Action = (el: HTMLElement, e: MouseEvent, arg: string | undefined) => void;

const STRATA = ['all', '1', '0', '-1'] as const;
const DOMAINS = ['yagni', 'voice', 'saas'] as const;

export const ACTIONS: Record<string, Action> = {
  toggleSiteTheme: () => window.toggleSiteTheme(),
  // data-copy is the text; the email links and the reader's "copy link" button use it.
  copy: (el) => el.dataset.copy && window.copyToClipboard?.(el.dataset.copy),
  openBrief: (el, e) => window.openBrief?.(el as HTMLAnchorElement, e),
  closeBrief: () => {
    const slot = document.getElementById('post-reader-slot');
    if (slot) slot.innerHTML = '';
    window.setUrlParam?.('post', null);
  },
  activateFilterBtn: (el) => window.activateFilterBtn?.(el),
  copyToolbox: () => window.copyToolbox?.(),
  selectSkill: (el) => window.selectSkill?.(el),
  setIsoDomain: (el, _e, arg) => {
    const d = DOMAINS.find((x) => x === arg);
    if (d) window.setIsoDomain?.(d, el);
  },
  setIsoStratum: (el, _e, arg) => {
    const s = STRATA.find((x) => x === arg);
    if (s) window.setIsoStratum?.(s === 'all' ? 'all' : (Number(s) as 1 | 0 | -1), el);
  },
  triggerIsoFault: (_el, _e, arg) => window.triggerIsoFault?.(arg === 'keep-focus'),
  toggleIsoXray: (el) => window.toggleIsoXray?.(el),
  resetIsoCamera: () => window.resetIsoCamera?.(),
  fireIsoPacket: () => window.fireIsoPacket?.(),
  stepIsoNode: (_el, _e, arg) => window.stepIsoNode?.(arg === '-1' ? -1 : 1),
  openDomainBlueprint: () => window.openDomainBlueprint?.(),
};

export function initActions(root: Document = document) {
  root.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-action]');
    const name = el?.dataset.action;
    if (!el || !name || !Object.hasOwn(ACTIONS, name)) return;
    ACTIONS[name](el, e as MouseEvent, el.dataset.arg);
  });
}
