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
      'Field notes by Gleb Rosev on production AI agents, systems and engineering leadership: every post in full, with a 30-second brief.',
    bookedTitle: 'Booked — Gleb Rosev',
    bookedDescription: 'Your call with Gleb Rosev is booked. A calendar invite from cal.com is on its way.',
    buildTitle: 'How this site was built — Gleb Rosev',
    buildDescription:
      'Every merged PR of rossev.dev with its receipts: the test committed red first (all but the first PR), what was caught before merge, what Gleb decided, and links to the commits.',
    buildHeadline: 'How this site was built',
    hireTitle: 'Work with Gleb Rosev — AI agent reliability audit, advisory, talks',
    hireDescription:
      'Bring in Gleb Rosev on AI agents in production: a reliability audit of your agents, advisory for engineering leaders, talks and workshops, or a full-time role. Every offer links its proof.',
    caseDescription: (company: string, period: string, summary: string) => `Architecture breakdown, ${company} (${period}): ${summary}`
  },
  nav: {
    sections: 'Sections',
    experience: 'Experience',
    writing: 'Writing',
    contact: 'Contact',
    hire: 'Work with me',
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
    hire: 'Work with me',
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
    replayBadge: 'REPLAY · PR #11',
    yourRun: 'YOUR RUN',
    simulated: 'simulated',
    toyService: 'toy service',
    policyLabel: (n: number) => `A learned policy (${n.toLocaleString('en')} params), trained offline — not scripted`,
    faultMenu: 'Pick a fault for the learned policy',
    faultKinds: {
      latency: 'Slow dependency',
      node_down: 'Node down',
      bad_deploy: 'Bad deploy',
      surge: 'Traffic surge'
    },
    // Drawn on the canvas during a run of the learned policy on the toy service.
    policyCanvas: {
      policy: 'policy',
      loading: 'Loading the policy…',
      run: {
        latency: 'A dependency is getting slow. The policy sees only the dashboard, not the cause.',
        node_down: 'A node is failing. The policy sees only the dashboard, not the cause.',
        bad_deploy: 'A change the tests do not catch is on its way to main.',
        surge: 'Traffic is climbing. The policy sees only the dashboard, not the cause.'
      },
      recovered: 'Recovered: back within the SLO after {n} ticks, decided from the dashboard alone.',
      recoveredPaged: 'Recovered: back within the SLO after {n} ticks, after the policy paged a human.',
      caught: 'Caught before merge: the policy blocked it on the judge’s risk signal. The change goes back to the builder.',
      shipped: 'It shipped: the change passed the tests and, with the judge off, nothing flagged it. This is why the judge exists.',
      loadFailed: 'The policy did not load, so nothing ran. Try again.',
      lastAction: 'Last action',
      rolledBack: 'It shipped, then the policy rolled it back: within the SLO again after {n} ticks.',
      failed: 'Failed: the policy could not keep up and the service stayed outside its SLO.',
      recoveredStamp: 'RECOVERED',
      failedStamp: 'FAILED',
      drained: 'drained',
      queue: 'queue',
      errors: 'errors',
      nodes: 'nodes'
    },
    injectFault: 'Inject a fault',
    judge: 'Judge',
    judgeOn: 'on',
    judgeOff: 'off',
    resume: '▶ Resume replay',
    pause: 'Pause the replay',
    timeline: 'Replay timeline: one stop per event of the run',
    // Drawn on the canvas by src/scripts/replay/player.ts; {mse} is the regrown GR's error.
    replayCanvas: {
      approved: 'HUMAN ✓ APPROVED',
      caught: 'CAUGHT BEFORE MERGE',
      merged: 'MERGED · PR #11',
      shipped: 'SHIPPED',
      shippedWhy: 'It shipped: the tests were green and the person approving saw nothing wrong. This is why the judge exists.',
      faultRun: 'A bug the tests do not cover is on its way to main.',
      testsGreen: 'TESTS ✓ GREEN',
      caughtLive: 'The judge caught it before merge. The change goes back to the builder.',
      cutHint: 'Drag across the GR to cut it',
      cutHealing: 'Regrowing on the model this site ships, in your browser…',
      healed: 'Healed: the G stays a G (error {mse}).',
      unhealed: 'Not healed this time (error {mse}).',
      step: 'step',
      nodes: [
        'A person approves the plan here. Nothing merges without it.',
        'The agent team splits the work: plan, build, review.',
        'Writes the code and the tests for it.',
        'A second model checks the work with fresh eyes before a person sees it.',
        'Runs the code and its tests in isolation, away from anything real.',
        "Keeps each customer's data and keys apart.",
        'Studies failed runs and proposes fixes. People approve them.',
        'Spots stuck or failing runs before a customer does.'
      ]
    },
    caseLink: 'This is what I built at YAGNI. See the breakdown →',
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
    reset: 'Reset',
    regrowing: "Couldn't heal this one — regrowing from a single cell."
  },
  vad: {
    kicker: 'TRY IT // VOICE ACTIVITY DETECTION',
    lead:
      'At Sully the agent greeted callers while the line was still ringing, so they picked up to ~15 s of silence. The fix: wait until the person speaks, then greet. Here is that building block, running in your browser: Silero VAD v6, a 0.5 MB model that hears speech in 32 ms frames.',
    beforeValue: '~15 s',
    before: 'Sully, before the fix: dead air at pickup',
    afterLabel: 'This model, on your device: time to notice your voice',
    start: 'Say hello',
    privacy: 'Audio stays on your device; nothing is recorded or sent.',
    asking: 'Allow the microphone to start.',
    loading: 'Loading the model (0.5 MB):',
    calibrating: 'Measuring the room for a moment. Stay quiet…',
    listening: 'Listening. Say hello.',
    detected: 'Heard you after',
    quiet: "Didn't hear anything for 15 s: about as long as a Sully caller waited. Try again closer to the mic.",
    denied: 'Microphone access was blocked. Nothing was recorded. Allow it in the site settings to try.',
    nomic: 'No microphone found.',
    unsupported: "This browser can't run the demo: it needs microphone access and AudioWorklet.",
    savedata: 'Paused to save your data: the demo downloads a 0.5 MB model. On a faster connection it runs right here.',
    error: 'Something went wrong. Nothing was recorded.',
    ms: 'ms',
    compute: 'ms of compute for that frame on this device.',
    how:
      'Measured from the 32 ms frame where your voice rose above the room to the model’s decision, plus the compute time. Your voice can start anywhere in that first frame, so it may read up to 32 ms high; the look-back stops at about a second. Mic and OS buffering before the page gets the audio are not counted. At Sully the win was not a faster model but the agent waiting for a voice instead of a ringing line.'
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
  hire: {
    home: '← Home',
    kicker: 'Work with me',
    title: 'AI agents that hold up in production',
    lead: 'Four ways to work together. Each one links the proof already on this site. The first step is always a 30-minute call: no price list, because every team starts from a different place.',
    forWho: 'Who it is for',
    youGet: 'What you get',
    proof: 'Proof',
    cta: 'BOOK A 30-MIN CALL ↗',
    ctaLead: 'Tell me the problem on a call. I reply within 24h.'
  },
  // /c: the card behind the QR code on the phone case
  card: {
    title: 'Gleb Rosev — contact card',
    role: 'Founding Engineer at YAGNI. I make AI agent teams hold up in production.',
    book: 'Book a 30-min call',
    save: 'Save contact',
    email: 'Email',
    call: 'Call',
    hire: 'Ways to work together →',
    site: 'Full site →'
  },
  build: {
    home: '← Home',
    kicker: 'Receipts',
    title: 'How this site was built',
    lead: 'Agents wrote the code, I did the planning. That is easy to say, so here are the receipts: every merged PR of this site except data refreshes and bot PRs, with the test committed red before the code (a card without one says why, or that the reason is still to come), what was caught before merge, and what I decided.',
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
    noRedTest: 'No red test first — reason still to come',
    pending: 'My notes on this PR are still to come: for now the card shows only what git and GitHub record.',
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
