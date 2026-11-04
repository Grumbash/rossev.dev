// Home page helpers the markup calls through data-action (scripts/actions.ts): the inline post reader (?post= restore, openBrief,
// focus after a swap), the essay filter tabs and the toolbox (copy as text, skill → jobs highlight).
declare global {
  interface Window {
    htmx?: { process: (el: Element) => void; trigger: (el: Element, name: string) => void };
    openBrief: (link: HTMLAnchorElement, e: MouseEvent) => void;
    activateFilterBtn: (btn: HTMLElement) => void;
    copyToolbox: () => void;
    clearSkill: () => void;
    selectSkill: (btn: HTMLElement) => void;
  }
}

export function initHome() {
  // Restore the inline brief from ?post=<id> on load. Not an htmx swap, so wire up the reader's
  // hx-* links (its "Next") by hand; never moves focus.
  const postParam = new URLSearchParams(window.location.search).get('post');
  if (postParam && /^post-\d+$/.test(postParam)) {
    // Fragments live next to the page's locale: /partials/... or /ru/partials/...
    const prefix = document.documentElement.lang === 'en' ? '' : `/${document.documentElement.lang}`;
    fetch(`${prefix}/partials/post-${postParam}`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((html) => {
        const slot = document.getElementById('post-reader-slot');
        if (!slot || !html) return;
        slot.innerHTML = html;
        window.htmx?.process(slot);
      })
      .catch(() => {});
  }

  // Post cards and the reader's "Next" are real links to /writing/<slug>/. An unmodified left
  // click opens the brief inline instead; ctrl/cmd/shift/alt-click and middle-click keep the
  // browser default (the page, usually in a new tab). htmx would cancel the default of every
  // click it handles, so those links listen for open-brief, fired only from here.
  window.openBrief = (link, e) => {
    if (!window.htmx || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.htmx.trigger(link, 'open-brief');
    window.setUrlParam?.('post', link.getAttribute('data-track-id'));
    setTimeout(() => document.getElementById('post-reader-slot')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
  };
  // Every htmx swap into the reader slot comes from openBrief (a card or the reader's "Next",
  // which the swap just removed), so hand keyboard focus to the new brief's heading.
  document.addEventListener('htmx:afterSwap', (e) => {
    const target = (e as CustomEvent).detail?.target as HTMLElement | undefined;
    if (target?.id !== 'post-reader-slot') return;
    target.querySelector<HTMLElement>('.post-reader-heading')?.focus({ preventScroll: true });
  });

  window.activateFilterBtn = (btn) => {
    btn.parentElement?.querySelectorAll('.filter-tab').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
  };

  window.copyToolbox = () => {
    const lines = ['Gleb Rosev — toolbox (' + location.origin + ')'];
    document.querySelectorAll('[data-toolbox-row]').forEach((row) => {
      const head = row.querySelector('.toolbox-head')?.textContent?.trim();
      const skills = [...row.querySelectorAll('.toolbox-skills > *')].map((el) => el.textContent?.trim());
      lines.push(head + ': ' + skills.join(', '));
    });
    window.copyToClipboard(lines.join('\n'), 'toolbox');
  };

  window.clearSkill = () => {
    document.querySelectorAll('.skill-link').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    document.querySelectorAll('.job-card').forEach((c) => c.classList.remove('job-dim', 'job-match'));
    const result = document.getElementById('toolbox-result');
    if (result) {
      result.hidden = true;
      result.innerHTML = '';
    }
  };

  window.selectSkill = (btn) => {
    const wasActive = btn.classList.contains('active');
    window.clearSkill();
    if (wasActive) return;
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    const jobs = (btn.getAttribute('data-jobs') || '').split(' ');
    const links: HTMLAnchorElement[] = [];
    document.querySelectorAll('.job-card').forEach((card) => {
      const match = jobs.includes(card.id);
      card.classList.toggle('job-match', match);
      card.classList.toggle('job-dim', !match);
      if (match) {
        const a = document.createElement('a');
        a.className = 'text-link';
        a.href = '#' + card.id;
        a.textContent = card.getAttribute('data-company') + ' ↓';
        links.push(a);
      }
    });
    const result = document.getElementById('toolbox-result');
    if (!result) return;
    // The page's own words for "used at" and "clear" ride on the result box (data-used-at, data-clear).
    result.innerHTML = '<strong></strong> <span></span> ';
    result.querySelector('strong')!.textContent = btn.getAttribute('data-skill');
    result.querySelector('span')!.textContent = result.dataset.usedAt ?? '';
    links.forEach((a) => result.append(a, ' '));
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'copy-btn';
    clear.textContent = result.dataset.clear ?? '×';
    clear.onclick = window.clearSkill;
    result.append(clear);
    result.hidden = false;
  };
}
