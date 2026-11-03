// UI strings, English. This file is the source of the key set: every other locale must have exactly
// these keys (the `Dict` type in ./index.ts, plus a check at build time). Content with its own
// {en, ru} pairs (posts, cases, jobs) stays in src/data/profile.ts. Keys ending in `Html` hold
// inline markup and are rendered with set:html.
export const en = {
  meta: {
    ogLocale: 'en_US',
    name: 'Gleb Rosev',
    homeTitle: 'Gleb Rosev — Founding Engineer @ YAGNI | AI Agent Teams, Architecture & Reliability',
    homeDescription:
      'Gleb Rosev — Founding Engineer at YAGNI (yagni.app) making AI agent teams dependable in production. 8+ years building distributed systems, Voice AI (Sully.ai), and leading engineering teams.',
    homeOgTitle: 'Gleb Rosev — Founding Engineer @ YAGNI (yagni.app)',
    homeOgDescription:
      'Making AI agent teams dependable in production, not just impressive in a demo. Agent benchmarks, self-improving loops, healthcare Voice AI & distributed systems.',
    homeTwitterDescription: 'Making AI agent teams dependable in production, not just impressive in a demo.',
    writingTitle: 'Writing — Gleb Rosev',
    writingDescription:
      'Field notes by Gleb Rosev on production AI agents, systems and engineering leadership: 30-second briefs of his LinkedIn posts.',
    bookedTitle: 'Booked — Gleb Rosev',
    bookedDescription: 'Your call with Gleb Rosev is booked. A calendar invite from cal.com is on its way.',
    buildTitle: 'How this site was built — Gleb Rosev',
    buildDescription:
      'Every merged PR of rossev.dev with its receipts: the test committed red first (all but the first PR), what was caught before merge, what Gleb decided, and links to the commits.',
    buildHeadline: 'How this site was built',
    caseDescription: (company: string, period: string, summary: string) => `Architecture breakdown, ${company} (${period}): ${summary}`
  },
  nav: {
    sections: 'Sections',
    experience: 'Experience',
    writing: 'Writing',
    contact: 'Contact',
    theme: 'THEME',
    themeTitle: 'Toggle Light / Dark Mode',
    bookCall: 'BOOK A CALL ↗',
    // Label of a link to this language, in this language (the switch on every other locale's pages).
    readIn: 'Read in English',
    current: 'Current language: English'
  },
  footer: {
    kicker: 'Contact',
    title: 'Let’s talk',
    lead: 'Always happy to connect with founders, engineering leaders, and builders working on production AI agents and distributed systems.',
    bookCall: 'BOOK A 30-MIN CALL ↗',
    copyEmail: 'COPY EMAIL',
    cv: 'CV (PDF) ↓',
    howBuilt: 'How this site was built',
    education: 'Education',
    educationValue: 'Belarusian State University — Medicine (2015 — 2019)',
    languages: 'Languages',
    based: 'Based',
    remote: 'Remote',
    cvBuiltFrom: 'CV auto-built from'
  },
  toast: {
    copied: 'Copied: ',
    copiedDefault: 'COPIED TO CLIPBOARD'
  },
  hero: {
    firstName: 'GLEB',
    lastName: 'ROSEV',
    bookIntro: 'BOOK A 30-MIN INTRO CALL ↗',
    downloadCv: 'DOWNLOAD CV ↓',
    ctaNote: 'Hiring for AI agents or platform? Tell me the problem — I reply within 24h.',
    copy: 'copy',
    remote: 'Remote',
    buildLoop: 'Same loop on this site’s own PRs →'
  },
  topology: {
    title: '3D SYSTEM ARCHITECTURE TOPOLOGY',
    step1: "1 · A human approves the plan. Agents don't touch code until a person signs off.",
    step2: '2 · Agents build in a sandbox. Builder writes code and tests, a separate judge reviews, everything runs isolated.',
    step3: '3 · Break it. Inject a fault and watch the guard catch it.',
    caseLink: 'This is what I built at YAGNI. See the breakdown →',
    prev: 'Previous step',
    next: 'Next ›',
    breakHeal: 'Break & heal',
    explore: 'Explore',
    domainYagni: 'AGENT TEAMS (YAGNI)',
    domainVoice: 'VOICE AI (SULLY)',
    domainSaas: 'B2B SAAS & OPS',
    fault: 'INJECT FAULT',
    xray: 'CAD X-RAY',
    overview: 'OVERVIEW',
    trace: 'TRACE',
    play: '▶ Play',
    strataAll: 'ALL 3 DECKS',
    stratumTop: 'L+1 · ORBITAL RADAR',
    stratumCore: 'L0 · CORE DECK',
    stratumVault: 'L-1 · SUB-VAULT',
    prevNode: '‹ PREV NODE',
    faultHeal: 'BREAK & HEAL',
    nextNode: 'NEXT NODE ›',
    blueprint: 'BLUEPRINT ↘'
  },
  experience: {
    kicker: 'Experience · 2018 — now',
    title: '8+ years in production',
    now: 'Now',
    stack: 'Stack',
    breakdown: 'ARCHITECTURE BREAKDOWN',
    openBreakdown: (company: string) => `Open the ${company} breakdown →`
  },
  toolbox: {
    label: 'Toolbox · for skimmers and screeners',
    lead: 'Every keyword in one place, for recruiters who skim and the ATS and LLMs that parse. Click a skill to see where I used it. The same list lives in',
    copy: 'COPY AS TEXT',
    usedAt: '— used at',
    clear: 'clear ×'
  },
  nca: {
    heading: 'Self-healing GR monogram',
    label: 'GR monogram grown by a neural cellular automaton.',
    labelLive: ' Press Enter or Space to take a bite out of it and watch it heal.',
    caption:
      'An 8,320-parameter neural cellular automaton, trained from scratch, running in your browser. Every pixel runs the same tiny network and only sees its neighbours.',
    captionLive: 'Damage it: drag across the letters (or Tab + Enter).',
    captionPaused: 'Paused to save your data: on a faster connection this monogram grows and heals itself.',
    bridge: 'Same idea I apply to production:',
    bridgeLink: 'systems that notice damage and repair themselves →',
    howHtml:
      'How it works: each cell holds 16 numbers, reads its 3×3 neighbourhood through Sobel filters and updates through one 128-unit hidden layer. Trained to grow from a single cell and to heal after cuts and bites, after <a class="text-link" href="https://distill.pub/2020/growing-ca/" target="_blank" rel="noopener noreferrer">Mordvintsev et al., Distill 2020 ↗</a>',
    reset: 'Reset'
  },
  writing: {
    beyond: 'Beyond the CV',
    kicker: 'Writing',
    title: 'Field notes on AI, systems & leadership',
    follow: 'FOLLOW ON LINKEDIN ↗',
    filterLabel: 'Filter essays by topic',
    filterAll: 'All',
    filterAi: 'AI systems',
    filterLeadership: 'Leadership',
    filterSystems: 'Reliability',
    filterDelivery: 'Delivery',
    allPosts: (n: number) => `ALL ${n} POSTS →`,
    readBrief: 'READ BRIEF',
    readBriefLink: 'Read brief →',
    allWriting: '← All writing'
  },
  reader: {
    header: '// ENGINEERING NOTE BRIEF //',
    close: 'CLOSE ×',
    next: 'NEXT:',
    copyLink: 'COPY LINK',
    follow: 'Follow on LinkedIn ↗',
    cta: 'Building agents that need to work in prod? 30-min intro call →'
  },
  blueprint: {
    header: 'SYSTEM ARCHITECTURE //',
    problem: 'PROBLEM & CONSTRAINTS',
    solution: 'ARCHITECTURAL SOLUTION',
    flow: 'PRODUCTION DATA & CONTROL FLOW:',
    outcomes: 'KEY PRODUCTION OUTCOMES:'
  },
  casePage: {
    kicker: (company: string) => `Architecture breakdown · ${company}`,
    back: (company: string) => `← ${company} in the experience timeline`
  },
  booked: {
    kicker: 'Booked',
    title: 'Booked — talk soon.',
    lead: 'A calendar invite from cal.com is on its way. Before we talk:',
    yagni: 'How I build AI agent teams at YAGNI →',
    reply: 'Reply to the invite with what you’re hiring for — I’ll come prepared.'
  },
  build: {
    home: '← Home',
    kicker: 'Receipts',
    title: 'How this site was built',
    lead: 'Agents wrote the code, I did the planning. That is easy to say, so here are the receipts: every merged PR of this site, with the test committed red before the code (all but the first PR, made before this loop), what was caught before merge, and what I decided.',
    scopeHtml: (homeHref: string) =>
      `The PR count and percentages on <a class="text-link" href="${homeHref}">the home page</a> are about my work at YAGNI, not this site. This page shows the same loop on this site’s own PRs.`,
    loopTitle: 'How the loop runs now',
    loopFraming: 'Framing',
    loopFramingNote: 'the job to be done, with me',
    loopRed: 'Red test',
    loopRedNote: 'committed first, failing',
    loopWriter: 'Writer agent',
    loopWriterNote: 'an independent agent makes it pass',
    loopJudge: 'Judge',
    loopJudgeNote: 'independent LLM passes on the diff',
    loopFix: 'Fix',
    loopFixNote: 'then browser and perf checks',
    loopMerge: 'Merge',
    loopMergeNote: 'by me, the human',
    loopNote:
      'Judge and fix repeat until every confirmed finding is fixed. Highlighted steps are mine. The loop grew over these PRs: a card mentions a review only where its PR says one ran.',
    statPrs: 'Merged PRs',
    statRedFirst: 'Red test first',
    statFindings: 'Findings highlighted',
    statCommits: 'Commits, no merges',
    prsTitle: 'Every PR, oldest first',
    merged: 'merged',
    forVisitors: 'For visitors',
    redGreen: 'Red → green',
    redTest: 'Red test',
    review: 'Review',
    caught: 'Caught before merge',
    decided: 'What I decided',
    onGithub: (n: number) => `PR #${n} on GitHub ↗`,
    files: 'files',
    commits: 'commits',
    ctaLead: 'If you build with agents and want a loop like this on your repo, happy to talk it through.',
    cta: 'BOOK A 30-MIN CALL ↗'
  }
} as const;
