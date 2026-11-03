export interface CaseStudy {
  id: string;
  company: string;
  period: string;
  location: string;
  color: string;
  badge: { en: string; ru: string };
  title: { en: string; ru: string };
  summary: { en: string; ru: string };
  metrics: { value: string; label: { en: string; ru: string } }[];
  stack: string[];
  architecture: {
    en: {
      challenge: string;
      solution: string;
      outcomes: string[];
      topology: string[];
    };
    ru: {
      challenge: string;
      solution: string;
      outcomes: string[];
      topology: string[];
    };
  };
}

export interface ExperienceItem {
  id: string;
  role: { en: string; ru: string };
  company: string;
  period: { en: string; ru: string };
  location: { en: string; ru: string };
  domain: { en: string; ru: string };
  color: string;
  metrics: string[];
  highlights: { en: string[]; ru: string[] };
  // Company or product site; rendered as a link on the company name.
  url?: string;
  // CASE_STUDIES id whose architecture breakdown expands under this job.
  caseId?: string;
  stack: string[];
}

export interface BlogPost {
  id: string;
  // Page at /writing/<slug>/. Never change a published slug: it is the canonical URL.
  slug: string;
  // UTC date of the LinkedIn original, from the snowflake id in `url` (top bits = ms timestamp).
  published: string;
  category: 'ai' | 'leadership' | 'systems' | 'delivery';
  categoryLabel: { en: string; ru: string };
  // Read time of the LinkedIn original; the brief itself is a 30-second read.
  originalMinutes: number;
  url: string;
  title: { en: string; ru: string };
  takeaway: { en: string; ru: string };
  tags: string[];
  // The on-site 30-second brief, rendered by PostBrief.astro both inline and on the post page.
  brief: {
    quote: { en: string; ru: string };
    bullets: { en: string[]; ru: string[] };
  };
  // Optional longer text for the post page only. Paragraphs split on blank lines.
  body?: { en: string; ru: string };
  color: string;
}

// "30-SEC BRIEF · 3-MIN ORIGINAL": what the reader gets here vs. on LinkedIn.
export const readTimeLabel = (post: BlogPost) => ({
  en: `30-SEC BRIEF · ${post.originalMinutes}-MIN ORIGINAL`,
  ru: `30 СЕК РАЗБОР · ${post.originalMinutes} МИН ОРИГИНАЛ`
});

export const postPath = (post: BlogPost) => `/writing/${post.slug}/`;

export const PROFILE = {
  name: {
    en: 'Gleb Rosev',
    ru: 'Глеб Росев'
  },
  // Version A (max 12 words):
  tagline: {
    en: 'FOUNDING ENGINEER @ YAGNI.APP // PRODUCTION AI AGENTS',
    ru: 'FOUNDING ENGINEER В YAGNI.APP // НАДЁЖНЫЕ AI-АГЕНТЫ'
  },
  location: {
    en: 'Tbilisi, Georgia',
    ru: 'Тбилиси, Грузия'
  },
  phone: '+995 591 90 81 80',
  email: 'rossevgleb@gmail.com',
  linkedin: 'https://www.linkedin.com/in/rossev',
  linkedinHandle: 'linkedin.com/in/rossev',
  github: 'https://github.com/Grumbash',
  githubHandle: 'github.com/Grumbash',
  calendar: 'https://cal.com/rossev',
  languages: [
    { en: 'English · C1', ru: 'Английский · C1' },
    { en: 'Russian · native', ru: 'Русский · родной' }
  ],
  timezone: 'UTC+4',
  // One third-person sentence: who he is, both spellings. Same text opens /llms.txt.
  summaryThirdPerson: {
    en: 'Gleb Rosev (also spelled Rossev) is a Founding Engineer at YAGNI (yagni.app) in Tbilisi, building production AI agent teams; previously Staff Harness Engineer at Sully.ai; 8+ years in engineering; medical degree.',
    ru: 'Глеб Росев (латиницей также Rossev) — Founding Engineer в YAGNI (yagni.app), Тбилиси: строит команды AI-агентов для продакшена; ранее — Staff Harness Engineer в Sully.ai; 8+ лет в разработке; медицинское образование.'
  },
  // Value line under the name: what I solve + proof. Every number must already be a fact on the page.
  valueLine: {
    en: 'AI agents that hold up in production, not just in the demo: dead air at pickup on healthcare calls cut from 15 s to 0; 28 PRs in week one: agents wrote 98% of the code, I did 97% of the planning.',
    ru: 'AI-агенты, которые держатся в продакшене, а не только на демо: тишина при ответе в медицинских звонках — 15 с → 0; 28 PR за первую неделю: 98% кода написали агенты, 97% планирования — моё.'
  },
  // Short bio for the hero only (max 40 words EN). The long `bio` below feeds the CV PDF and llms.txt.
  bioShort: {
    en: 'Now: Founding Engineer at YAGNI, building AI agent teams (PM, Builder, Reviewer) that take work from proposal to merged PR under human-approved plans. Before: healthcare voice AI at Sully.ai. 8+ years, plus a medical degree.',
    ru: 'Сейчас: Founding Engineer в YAGNI — команды AI-агентов (PM, Builder, Reviewer), которые доводят задачу от предложения до смерженного PR по утверждённому человеком плану. До этого: голосовой AI для медицины в Sully.ai. 8+ лет, плюс медицинское образование.'
  },
  // Version B (50-70 words, first person, concrete, no hype):
  bio: {
    en: 'I build software systems where reliability matters, and I make AI agent teams dependable in production, not just impressive in a demo. Now: Founding Engineer at YAGNI (yagni.app), working with the founders on AI agent teams (PM, Builder, Reviewer) that take work from a proposal to a merged GitHub PR under human-approved plans. Before that: Staff Harness Engineer on healthcare voice AI at Sully.ai. 8+ years across full-stack, mobile, cloud and engineering management, plus a medical degree.',
    ru: 'Я строю системы, где важна надёжность, и делаю команды AI-агентов надёжными в продакшене, а не только на демо. Сейчас: Founding Engineer в YAGNI (yagni.app), вместе с фаундерами строю команды агентов (PM, Builder, Reviewer), которые доводят задачу от предложения до смерженного PR в GitHub по утверждённому человеком плану. До этого: Staff Harness Engineer в голосовом AI для медицины в Sully.ai. 8+ лет в full-stack, мобайле, облаках и управлении командами, плюс медицинское образование.'
  },
  medToAiStory: {
    en: 'How I work: I build with AI agents every day — I plan, delegate to agents, review their output with a second "judge" agent, and keep the human decision where it matters.',
    ru: 'Как я работаю: каждый день строю системы с помощью AI-агентов — планирую, делегирую задачи агентам, проверяю результат через агента-судью и оставляю ключевые решения за человеком.'
  },
  heroStats: [
    {
      value: '8+ YRS',
      label: { en: 'Production Systems', ru: 'В продакшене' },
      color: 'var(--lime)'
    },
    {
      value: '-80%',
      label: { en: 'Feedback Analysis Time (Kingpin)', ru: 'Время анализа фидбека (Kingpin)' },
      color: 'var(--cyan)'
    },
    {
      value: '15s → 0s',
      label: { en: 'Dead Air at Pickup (Sully.ai)', ru: 'Тишины при ответе (Sully.ai)' },
      color: 'var(--yellow)'
    },
    {
      value: '5–12',
      label: { en: 'Engineers Led', ru: 'Инженеров в командах' },
      color: 'var(--orange)'
    }
  ]
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'yagni',
    company: 'YAGNI (yagni.app)',
    period: 'NOV 2026 — PRESENT',
    location: 'Tbilisi · Remote',
    color: 'var(--lime)',
    badge: { en: 'AGENT TEAMS FOR ENGINEERING', ru: 'КОМАНДЫ AI-АГЕНТОВ' },
    title: {
      en: 'Dependable Agent Teams: From Proposal to Merged GitHub PR',
      ru: 'Команды AI-агентов: от предложения до смерженного PR в GitHub'
    },
    summary: {
      en: 'Named AI agents (builder, reviewer, PM) that work under human-approved plans with auditable records, sandboxed execution, and realistic evaluation benchmarks.',
      ru: 'Именованные AI-агенты (разработчик, ревьюер, PM), работающие по утверждённому человеком плану с полным аудитом шагов, песочницей и бенчмарками.'
    },
    metrics: [
      { value: '28 PRs', label: { en: 'Merged in the first week: 98% of the code by agents, 97% of the planning by me', ru: 'Смержено за первую неделю: 98% кода написали агенты, 97% планирования — моё' } }
    ],
    stack: ['Agent Benchmarks', 'Self-Improving Loops', 'Sandboxed Runner', 'Tenant Query Guards', 'Self-Healing Syncs', 'Risk Radar'],
    architecture: {
      en: {
        challenge: 'Making AI agent teams dependable in real customer codebases—where every action must be auditable, tenant data strictly isolated, external workspace syncs self-healing, and regressions caught before customers notice.',
        solution: 'Built tenant isolation and code-review agent routing, made external workspace backfills self-healing, streamlined single-command worktree/CI builds, and built realistic evaluation benchmarks with an early-warning risk radar.',
        outcomes: [
          'Tenant isolation: tenant-scoped query guards and sandboxed code execution.',
          'Improved code-review agent reliability and evaluation benchmarks: fixed ticket-key collisions across external trackers and built realistic task suites to measure agent changes.',
          'Made connector backfills self-healing (stuck-cursor recovery, progress tracking, hard caps) and built an early-warning risk radar for stalled customer runs.',
          'Developed an experimental self-improving loop where agents inspect failed runs and propose fixes, and streamlined the monorepo build chain to a single command for worktrees and CI.'
        ],
        topology: [
          '[Human-Approved Plan] ──► [Named Agent Team: PM · Builder · Reviewer]',
          '[Sandboxed Code Runner + Org Isolation] ──► [Auditable GitHub PR]',
          '[Risk Radar & Stalled-Run Monitor] ──► [Self-Improving Root-Cause Agent]'
        ]
      },
      ru: {
        challenge: 'Сделать команды AI-агентов по-настоящему надёжными в продакшене: с прозрачным аудитом каждого шага, строгой мультитенантной изоляцией, самовосстанавливающейся синхронизацией и защитой от регрессий.',
        solution: 'Внедрил tenant-scoped query guards и песочницу для кода, устранил коллизии ключей тикетов у агента-ревьюера, сделал бэкфиллы коннекторов самовосстанавливающимися и внедрил бенчмарки с радаром рисков.',
        outcomes: [
          'Изоляция клиентов: tenant-scoped query guards и песочница для запуска кода.',
          'Повысил надёжность агента код-ревью и создал бенчмарки на реальных задачах: устранил коллизии ключей тикетов между YAGNI и внешними трекерами.',
          'Сделал синхронизацию больших внешних воркспейсов самовосстанавливающейся (stuck-cursor recovery, лимиты, трекинг) и внедрил «радар рисков» для клиентских прогонов.',
          'Создал экспериментальный контур самообучения агентов на разборе сбоев и упростил сборку монорепозитория для чистых worktree и CI до одной команды.'
        ],
        topology: [
          '[Утверждённый человеком план] ──► [Команда агентов: PM · Builder · Reviewer]',
          '[Песочница + Tenant Query Guards] ──► [Проверяемый PR в GitHub]',
          '[Self-Healing бэкфиллы + Радар рисков] ──► [Агент поиска первопричин сбоев]'
        ]
      }
    }
  },
  {
    id: 'sully',
    company: 'Sully.ai',
    period: 'SEP 2025 — OCT 2026',
    location: 'Dubai, UAE',
    color: 'var(--cyan)',
    badge: { en: 'VOICE AI & HARNESS', ru: 'ГОЛОСОВОЙ AI' },
    title: {
      en: 'Multilingual Voice AI & Runtime Diagnostic Harness',
      ru: 'Мультиязычный голосовой AI и система Runtime-диагностики'
    },
    summary: {
      en: 'AI receptionist for healthcare: voice agents for scheduling and clinic operations. Outbound call reliability, LiveKit dispatch, UAE data residency and the MENA launch.',
      ru: 'AI-ресепшионист для клиник: голосовые агенты для записи и операционки. Надёжность исходящих звонков, диспетчеризация в LiveKit, резидентность данных в ОАЭ и запуск в MENA.'
    },
    metrics: [
      { value: '15s → 0s', label: { en: 'Dead Air at Pickup', ru: 'Тишины при ответе' } },
      { value: 'MENA', label: { en: 'Launch Led', ru: 'Запуск в регионе' } },
      { value: '400+', label: { en: 'Healthcare Orgs (Sully)', ru: 'Медорганизаций (Sully)' } }
    ],
    stack: ['LiveKit', 'Twilio', 'Speechmatics', 'OpenAI / Claude / Gemini', 'TypeScript', 'Node.js', 'Agent Evals'],
    architecture: {
      en: {
        challenge: 'Enterprise healthcare launches demand low-latency multilingual voice over live telephony and immediate root-cause visibility.',
        solution: 'Engineered end-to-end voice & harness reliability layers spanning Twilio/LiveKit ingress, ASR/LLM orchestration, deterministic evals, and trace telemetry.',
        outcomes: [
          'Removed ~15 s of dead air at pickup on outbound calls: the agent was greeting the caller while the line was still ringing.',
          'Made agent dispatch reliable on LiveKit: retry-and-verify, no duplicate agents in one call, no silent calls.',
          'Designed UAE audio-residency guardrails so TTS and STT fallbacks stay within approved regional providers.'
        ],
        topology: [
          '[Telephony / SIP / Twilio] ──► [LiveKit Real-Time Media Router]',
          '[LiveKit Stream] ──► [Speechmatics ASR] ──► [AI Agent Harness & Guardrails]',
          '[Agent Harness] ──► [Eval & Runtime Trace Collector] ──► [Clinical EHR / Backend]'
        ]
      },
      ru: {
        challenge: 'Enterprise-медицина требует минимальной задержки в телефонных диалогах, мультиязычности и мгновенной локализации сбоев.',
        solution: 'Спроектировал контур надёжности голосовых агентов: от телефонии (Twilio/LiveKit) и ASR (Speechmatics) до оркестрации LLM, эвалов и трассировки.',
        outcomes: [
          'Убрал ~15 с тишины после ответа на исходящих звонках: агент здоровался, пока линия ещё звонила.',
          'Сделал диспетчеризацию агентов в LiveKit надёжной: retry-and-verify, без двойных агентов в звонке и без «немых» звонков.',
          'Спроектировал гарды резидентности аудио в ОАЭ: фолбэки TTS и STT остаются у одобренных региональных провайдеров.'
        ],
        topology: [
          '[Телефония / SIP / Twilio] ──► [LiveKit Real-Time Media Router]',
          '[Аудио-поток] ──► [Speechmatics ASR] ──► [AI Agent Harness & Guardrails]',
          '[Agent Harness] ──► [Eval & Runtime Trace Collector] ──► [Клинический Backend]'
        ]
      }
    }
  },
  {
    id: 'kingpin',
    company: 'Kingpin',
    period: '2024 — 2025',
    location: 'Dubai, UAE',
    color: 'var(--yellow)',
    badge: { en: 'MULTI-TENANT B2B SAAS', ru: 'B2B SAAS И AI' },
    title: {
      en: 'Wholesale B2B Platform & Automated LLM Insight Engine',
      ru: 'Мультитенантная B2B-платформа и LLM-конвейер аналитики'
    },
    summary: {
      en: 'Led 12 engineers shipping multi-tenant catalog/order workflows, ERP/CRM syncs, canary releases, and an LLM pipeline cutting feedback analysis time by 80%.',
      ru: 'Команда до 12 человек: мультитенантные заказы, синхронизация ERP/CRM, канареечные релизы и LLM-аналитика (-80% времени).'
    },
    metrics: [
      { value: '-80%', label: { en: 'Feedback analysis time', ru: 'Время анализа фидбека' } },
      { value: '12 ENG', label: { en: 'Team Led', ru: 'Команда' } },
      { value: 'Canary', label: { en: 'Trunk Delivery', ru: 'Деплой' } }
    ],
    stack: ['TypeScript', 'NestJS', 'React / Next.js', 'PostgreSQL', 'Redis', 'OpenAI / RAG', 'Grafana / Loki'],
    architecture: {
      en: {
        challenge: 'Scaling multi-tenant wholesale workflows with external ERP/CRM integrations while aligning a 12-person team on safe daily releases.',
        solution: 'Introduced feature flags, trunk-based canary rollouts, Grafana alerting, and an automated LLM pipeline synthesizing Sales/CS feedback.',
        outcomes: [
          'Cut feedback analysis time by 80% via an LLM clustering and insight pipeline.',
          'Delivered multi-tenant catalog and transactional order engines with bidirectional ERP/CRM sync.',
          'Established trunk-based delivery from main with feature flags and Grafana oversight.'
        ],
        topology: [
          '[Multi-Tenant B2B Portal] ──► [Feature-Flagged API Gateway / NestJS]',
          '[Order & Catalog Core] ◄──► [Async ERP / CRM Sync Workers + Redis]',
          '[Sales & CS Inputs] ──► [LLM Insight Pipeline] ──► [-80% Feedback Analysis Time]'
        ]
      },
      ru: {
        challenge: 'Масштабирование мультитенантной B2B-платформы с внешними ERP/CRM и переход команды из 12 человек на безопасные ежедневные релизы.',
        solution: 'Внедрил trunk-based разработку с фича-флагами, мониторинг в Grafana и автоматический LLM-пайплайн структуризации фидбека.',
        outcomes: [
          'Сократил время анализа фидбека от Sales и CS на 80% за счёт LLM-конвейера.',
          'Запустил мультитенантный каталог и транзакционный движок заказов с интеграцией ERP/CRM.',
          'Выстроил релизы из main через фича-флаги и канареечные выкатки.'
        ],
        topology: [
          '[Multi-Tenant B2B Portal] ──► [Feature-Flagged API Gateway / NestJS]',
          '[Order & Catalog Core] ◄──► [Async ERP / CRM Sync Workers + Redis]',
          '[Sales & CS Inputs] ──► [LLM Insight Pipeline] ──► [-80% времени анализа]'
        ]
      }
    }
  },
  {
    id: 'battlepro',
    company: 'BattlePro · Kernelics · ITechArt',
    period: '2018 — 2024',
    location: 'UK & US',
    color: 'var(--orange)',
    badge: { en: '220MS TTFB · CRYPTO · $10M+ ARCH', ru: '220 МС TTFB · КРИПТО · $10M+ АРХИТЕКТУРА' },
    title: {
      en: 'High-Velocity Web/Mobile Monorepos & $10M+ Virtual Network',
      ru: 'Крипто-монорепо (100K+ юзеров), 220 мс TTFB и платформа на $10M+'
    },
    summary: {
      en: 'Shipped native crypto modules to 100K+ downloads at Kernelics, doubled velocity (25 → 55 SP, 220ms TTFB) at BattlePro, and architected a $10M+ funded product.',
      ru: 'Нативные крипто-модули (100K+ скачиваний в Kernelics), удвоение велосити (25 → 55 SP, 220 мс TTFB в BattlePro) и архитектура продукта с $10M+ инвестиций.'
    },
    metrics: [
      { value: '100K+', label: { en: 'Crypto App Users', ru: 'Юзеров крипто-аппа' } },
      { value: '220ms', label: { en: 'TTFB (1.7s TTI)', ru: 'TTFB (1.7 с TTI)' } },
      { value: '$10M+', label: { en: 'Funding Raised', ru: 'Инвестиций' } }
    ],
    stack: ['TypeScript', 'React Native', 'Next.js', 'Native Crypto', 'Monorepo', 'Node.js', 'AWS'],
    architecture: {
      en: {
        challenge: 'Delivering high-security native cryptographic mobile apps and ultra-fast tournament platforms under hard event-driven launch deadlines.',
        solution: 'Unified web/mobile monorepo pipelines with native cryptographic bridges, redesigned SSR/caching for 220ms TTFB, and architected cloud virtual networking.',
        outcomes: [
          'Shipped secure cryptographic modules into an application with 100,000+ downloads at Kernelics.',
          'Hit 220–250ms TTFB and 1.7s TTI while doubling sprint throughput from 25 to 55 story points at BattlePro.',
          'Architected a full-stack virtual networking product that subsequently attracted $10M+ in investment.'
        ],
        topology: [
          '[Shared Monorepo] ──► [Native Crypto Modules (100K+ Downloads)]',
          '[Edge SSR & Cache Layer (220ms TTFB)] ──► [CMS-Driven UI Engine (1.7s TTI)]',
          '[Virtual Networking Orchestrator] ──► [$10M+ Funded Cloud Architecture]'
        ]
      },
      ru: {
        challenge: 'Поставка защищённых криптографических мобильных приложений и молниеносных турнирных сеток под жёсткие дедлайны мероприятий.',
        solution: 'Объединил Web/Mobile сборку в монорепо с нативной криптографией, оптимизировал SSR до 220 мс TTFB и спроектировал облачную сеть.',
        outcomes: [
          'Интегрировал криптографические модули в продакшен-приложение со 100 000+ скачиваний (Kernelics).',
          'Достиг 220–250 мс TTFB и 1.7 с TTI, удвоив скорость спринтов с 25 до 55 SP (BattlePro).',
          'Заложил full-stack архитектуру продукта, который привлёк более $10M инвестиций (ITechArt).'
        ],
        topology: [
          '[Shared Monorepo] ──► [Нативные крипто-модули (100K+ скачиваний)]',
          '[Edge SSR & Cache Layer (220ms TTFB)] ──► [CMS-Driven UI Engine (1.7s TTI)]',
          '[Virtual Networking Orchestrator] ──► [Архитектура под $10M+ инвестиций]'
        ]
      }
    }
  }
];

export const EXPERIENCE: ExperienceItem[] = [
  // Version C integrated right here as the #1 Experience entry!
  {
    id: 'exp-yagni',
    role: { en: 'Founding Engineer, AI Agents', ru: 'Founding Engineer, AI Agents' },
    company: 'YAGNI (yagni.app)',
    period: { en: 'Nov 2026 — Present', ru: 'Ноя 2026 — Наст. время' },
    location: { en: 'Tbilisi, Georgia · Remote', ru: 'Тбилиси, Грузия · Удалённо' },
    domain: {
      en: 'Early-stage US startup building named AI agent teams that take engineering work from proposal to merged GitHub pull request under human-approved plans.',
      ru: 'Американский стартап ранней стадии, создающий команды именованных AI-агентов, которые доводят задачи от предложения до смерженного PR в GitHub под контролем человека.'
    },
    color: 'var(--lime)',
    metrics: ['Founding Team', 'Agent Benchmarks', 'Multi-Tenant Isolation', 'Self-Healing Syncs'],
    url: 'https://yagni.app',
    caseId: 'yagni',
    stack: ['TypeScript', 'Node.js', 'PostgreSQL', 'Claude / OpenAI', 'GitHub', 'Agent Evals', 'Sandboxed Runners'],
    highlights: {
      en: [
        'Tenant isolation: tenant-scoped query guards and sandboxed code execution.',
        'Connector backfills made self-healing: stuck-cursor recovery, progress tracking and hard caps for long syncs of large workspaces.',
        'Code-review agent reliability: fixed ticket-key collisions between YAGNI and external trackers that sent the reviewer to the wrong issue.',
        'Agent benchmarks: realistic engineering task suites that show whether a prompt, model or harness change makes agents better or worse.',
        'Risk radar: flags stalled customer runs before the customer reports them.',
        'Self-improving loop (experimental): a meta-agent reads failed runs, isolates the cause and drafts a fix for the team to review.',
        'Monorepo build chain reduced to one command for fresh checkouts, worktrees and CI.',
        'Technical point of contact for pilot customers: demos, debugging live runs, turning feedback into engineering work.'
      ],
      ru: [
        'Изоляция клиентов: tenant-scoped query guards и песочница для запуска кода.',
        'Самовосстанавливающиеся бэкфиллы коннекторов: восстановление зависших курсоров, трекинг прогресса и жёсткие лимиты для долгих синков больших воркспейсов.',
        'Надёжность агента код-ревью: устранил коллизии ключей тикетов между YAGNI и внешними трекерами, из-за которых ревьюер шёл не в ту задачу.',
        'Бенчмарки агентов: реалистичные инженерные задачи, которые показывают, стал ли агент лучше или хуже после смены промпта, модели или харнесса.',
        'Радар рисков: замечает зависшие прогоны клиентов раньше, чем клиент о них сообщит.',
        'Контур самоулучшения (эксперимент): мета-агент разбирает упавшие прогоны, находит причину и готовит фикс на ревью команде.',
        'Сборка монорепозитория в одну команду для чистого checkout, worktree и CI.',
        'Технический контакт для пилотных клиентов: демо, разбор живых прогонов, перевод фидбека в инженерные задачи.'
      ]
    }
  },
  {
    id: 'exp-sully',
    role: { en: 'Staff Harness Engineer, AI Voice Systems', ru: 'Staff Harness Engineer, AI Voice Systems' },
    company: 'Sully.ai',
    period: { en: 'Sep 2025 — Oct 2026', ru: 'Сен 2025 — Окт 2026' },
    location: { en: 'Dubai, UAE', ru: 'Дубай, ОАЭ' },
    domain: {
      en: 'AI receptionist platform for healthcare: voice and text agents for scheduling, care coordination and clinic operations. Sully.ai serves 400+ healthcare organizations.',
      ru: 'Платформа AI-ресепшиониста для медицины: голосовые и текстовые агенты для записи, координации лечения и работы клиник. Sully.ai обслуживает 400+ медицинских организаций.'
    },
    color: 'var(--cyan)',
    metrics: ['15s → 0s Dead Air at Pickup', 'MENA Launch', 'Real-Time Voice AI'],
    url: 'https://www.sully.ai',
    caseId: 'sully',
    stack: ['LiveKit', 'Twilio', 'Speechmatics', 'OpenAI / Claude / Gemini', 'TypeScript', 'Node.js', 'Grafana / Loki / Mimir'],
    highlights: {
      en: [
        'Led core engineering for the MENA launch: UAE infrastructure, Azure Blob Storage support, regional configuration and production readiness.',
        'Removed ~15 s of dead air at pickup on outbound calls: the agent was greeting the caller while the line was still ringing.',
        'Made agent dispatch reliable on LiveKit: retry-and-verify, no more duplicate agents in one call, no more silent calls.',
        'Designed UAE audio-residency guardrails so TTS and STT fallbacks stay within approved regional providers instead of silently routing elsewhere.',
        'Built patient-data validation for outbound campaigns: local phone formats, customer-specific schemas, clinic rules.',
        'Built high-volume stress testing with headless LiveKit participants, Loki and Mimir validation, and runtime health checks; found and fixed the memory cascade behind burst failures.'
      ],
      ru: [
        'Вёл основную разработку для запуска в MENA: инфраструктура в ОАЭ, поддержка Azure Blob Storage, региональная конфигурация и готовность к продакшену.',
        'Убрал ~15 с тишины после ответа на исходящих звонках: агент здоровался, пока линия ещё звонила.',
        'Сделал диспетчеризацию агентов в LiveKit надёжной: retry-and-verify, без двойных агентов в одном звонке и без «немых» звонков.',
        'Спроектировал гарды резидентности аудио в ОАЭ: фолбэки TTS и STT остаются у одобренных региональных провайдеров, а не уходят молча к другим.',
        'Сделал валидацию данных пациентов для исходящих кампаний: локальные форматы номеров, схемы клиентов, правила клиник.',
        'Построил нагрузочное тестирование с headless-участниками LiveKit, проверкой через Loki и Mimir и runtime health checks; нашёл и устранил каскад по памяти, ронявший систему под всплесками.'
      ]
    }
  },
  {
    id: 'exp-kingpin',
    role: { en: 'Engineering Manager / Senior Full-Stack', ru: 'Engineering Manager / Senior Full-Stack' },
    company: 'Kingpin',
    period: { en: 'Sep 2024 — Sep 2025', ru: 'Сен 2024 — Сен 2025' },
    location: { en: 'Dubai, UAE', ru: 'Дубай, ОАЭ' },
    domain: {
      en: 'AI-powered multi-tenant B2B SaaS platform for wholesale.',
      ru: 'AI-платформа и мультитенантный B2B SaaS для дистрибуции.'
    },
    color: 'var(--yellow)',
    metrics: ['12 Engineers Led', '-80% Feedback Analysis Time', 'Canary Releases'],
    url: 'https://kingpin.ai',
    caseId: 'kingpin',
    stack: ['TypeScript', 'NestJS', 'React / Next.js', 'PostgreSQL', 'Redis', 'OpenAI / RAG', 'Grafana / Loki'],
    highlights: {
      en: [
        'Led a cross-functional team of up to 12 people while staying active in architecture and code.',
        'Delivered multi-tenant catalog/order workflows with ERP/CRM syncs and feature-flagged trunk-based releases.',
        'Built an LLM feedback pipeline converting Sales/CS input into product insights (-80% analysis time).'
      ],
      ru: [
        'Руководил командой до 12 человек, совмещая управление поставкой с работой в коде и архитектуре.',
        'Запустил мультитенантные заказы с ERP/CRM интеграциями, фича-флагами и мониторингом в Grafana.',
        'Создал LLM-пайплайн для фидбека от Sales и CS, сокративший время его анализа на 80%.'
      ]
    }
  },
  {
    id: 'exp-kernelics',
    role: { en: 'Lead React Native Developer', ru: 'Lead React Native Developer' },
    company: 'Kernelics',
    period: { en: 'Feb 2023 — Sep 2024', ru: 'Фев 2023 — Сен 2024' },
    location: { en: 'London, UK', ru: 'Лондон, Великобритания' },
    domain: {
      en: 'Product engineering across fintech, crypto, AI & healthcare.',
      ru: 'Продуктовая разработка в финтехе, крипто, AI и медицине.'
    },
    color: 'var(--orange)',
    metrics: ['100K+ Downloads', '5 Engineers Led', 'Unified Monorepo'],
    url: 'https://kernelics.com',
    stack: ['React Native', 'TypeScript', 'Native Crypto Modules', 'Monorepo', 'CI/CD'],
    highlights: {
      en: [
        'Led a 5-person team across web and mobile product delivery in a shared monorepo.',
        'Integrated native cryptographic modules into a flagship application with 100,000+ downloads.',
        'Hardened CI/CD build pipelines and production runtime stability.'
      ],
      ru: [
        'Возглавлял команду из 5 человек (Web и Mobile) в едином монорепозитории.',
        'Интегрировал защищённые криптографические модули в приложение со 100 000+ скачиваний.',
        'Укрепил CI/CD пайплайны и стабильность релизов в продакшене.'
      ]
    }
  },
  {
    id: 'exp-battlepro',
    role: { en: 'Frontend Team Lead · RN Manager · Full-Stack', ru: 'Frontend Team Lead · RN Manager · Full-Stack' },
    company: 'BattlePro & ITechArt',
    period: { en: 'Jan 2018 — Feb 2023', ru: 'Янв 2018 — Фев 2023' },
    location: { en: 'New York & New Jersey, US', ru: 'Нью-Йорк и Нью-Джерси, США' },
    domain: {
      en: 'Sports tournament platform, full-stack cloud architectures & technical mentorship.',
      ru: 'Турнирная платформа, full-stack облачные архитектуры и техническое менторство.'
    },
    color: 'var(--pink)',
    metrics: ['220ms TTFB (25→55 SP)', '$10M+ Raised Arch', '1,500+ Students/Yr'],
    // BattlePro is now ForgeHub.
    url: 'https://forgehub.com',
    caseId: 'battlepro',
    stack: ['React', 'Next.js', 'Node.js', 'TypeScript', 'AWS'],
    highlights: {
      en: [
        'Owned frontend architecture and hiring for a 5-engineer team at BattlePro; doubled velocity (25 → 55 SP) and hit 220ms TTFB / 1.7s TTI.',
        'Architected a full-stack virtual networking platform at ITechArt that subsequently attracted $10M+ in investment.',
        'Delivered 150+ advanced React/JS lectures at TeachMeSkills; curriculum adopted by 1,500+ students/year.'
      ],
      ru: [
        'Возглавлял фронтенд-команду из 5 человек в BattlePro: удвоил велосити (25 → 55 SP) и достиг 220 мс TTFB / 1.7 с TTI.',
        'Спроектировал full-stack архитектуру продукта виртуального нетворкинга в ITechArt, привлёкшего $10M+ инвестиций.',
        'Провёл 150+ лекций в TeachMeSkills и разработал программу обучения для 1 500+ студентов в год.'
      ]
    }
  }
];

export const CAPABILITIES = [
  {
    id: 'ai',
    title: { en: 'AI AGENTS & VOICE SYSTEMS', ru: 'AI-АГЕНТЫ И ГОЛОСОВЫЕ СИСТЕМЫ' },
    color: 'var(--lime)',
    skills: [
      'Agent Teams & Harnesses', 'Agent Evaluation & Benchmarks', 'Self-Improving Loops',
      'Sandboxed Code Runners', 'OpenAI / Claude / Gemini', 'LiveKit', 'Twilio',
      'Speechmatics', 'MCP', 'RAG Pipelines'
    ]
  },
  {
    id: 'arch',
    title: { en: 'ARCHITECTURE & CLOUD', ru: 'АРХИТЕКТУРА И ОБЛАКА' },
    color: 'var(--cyan)',
    skills: [
      'Distributed Systems', 'Multi-Tenant Isolation', 'Backend Services',
      'GitHub & ERP/CRM Integrations', 'PostgreSQL', 'Redis',
      'Kubernetes', 'Docker', 'AWS', 'GCP'
    ]
  },
  {
    id: 'reliability',
    title: { en: 'RELIABILITY & OPS', ru: 'НАДЁЖНОСТЬ И OPS' },
    color: 'var(--yellow)',
    skills: [
      'Risk Radar & Early Warning', 'Observability', 'Incident Response',
      'Runtime Diagnostics', 'Grafana', 'Loki', 'Mimir',
      'Trunk-Based Delivery', 'Canary Releases', 'Feature Flags'
    ]
  },
  {
    id: 'eng',
    title: { en: 'FULL-STACK & MOBILE', ru: 'FULL-STACK И МОБАЙЛ' },
    color: 'var(--orange)',
    skills: [
      'TypeScript', 'Node.js', 'NestJS', 'React',
      'React Native', 'Next.js', 'PostgreSQL', 'MongoDB',
      'Playwright', 'Cypress', 'Jest', 'Monorepos'
    ]
  },
  {
    id: 'leadership',
    title: { en: 'LEADERSHIP', ru: 'ЛИДЕРСТВО' },
    color: 'var(--pink)',
    skills: [
      'Teams of 5–12 Engineers', 'Customer Pilots & Demos',
      'Technical Hiring', 'System Architecture',
      'Mentoring (150+ Lectures)', 'Product Strategy'
    ]
  }
];

// Where each toolbox skill was used, as EXPERIENCE ids (exp-battlepro covers
// ITechArt too). A skill with no entry renders as plain text, not a filter.
export const SKILL_USAGE: Record<string, string[]> = {
  'Agent Teams & Harnesses': ['exp-yagni', 'exp-sully'],
  'Agent Evaluation & Benchmarks': ['exp-yagni', 'exp-sully'],
  'Self-Improving Loops': ['exp-yagni'],
  'Sandboxed Code Runners': ['exp-yagni'],
  'OpenAI / Claude / Gemini': ['exp-yagni', 'exp-sully', 'exp-kingpin'],
  LiveKit: ['exp-sully'],
  Twilio: ['exp-sully'],
  Speechmatics: ['exp-sully'],
  'RAG Pipelines': ['exp-kingpin'],
  'Distributed Systems': ['exp-yagni', 'exp-sully', 'exp-kingpin'],
  'Multi-Tenant Isolation': ['exp-yagni', 'exp-kingpin'],
  'Backend Services': ['exp-yagni', 'exp-sully', 'exp-kingpin', 'exp-battlepro'],
  'GitHub & ERP/CRM Integrations': ['exp-yagni', 'exp-kingpin'],
  PostgreSQL: ['exp-yagni', 'exp-kingpin'],
  Redis: ['exp-kingpin'],
  AWS: ['exp-battlepro'],
  'Risk Radar & Early Warning': ['exp-yagni'],
  Observability: ['exp-yagni', 'exp-sully', 'exp-kingpin'],
  'Runtime Diagnostics': ['exp-sully'],
  Grafana: ['exp-sully', 'exp-kingpin'],
  Loki: ['exp-sully', 'exp-kingpin'],
  Mimir: ['exp-sully'],
  'Trunk-Based Delivery': ['exp-kingpin'],
  'Canary Releases': ['exp-kingpin'],
  'Feature Flags': ['exp-kingpin'],
  TypeScript: ['exp-yagni', 'exp-sully', 'exp-kingpin', 'exp-kernelics', 'exp-battlepro'],
  'Node.js': ['exp-yagni', 'exp-sully', 'exp-battlepro'],
  NestJS: ['exp-kingpin'],
  React: ['exp-kingpin', 'exp-battlepro'],
  'React Native': ['exp-kernelics'],
  'Next.js': ['exp-kingpin', 'exp-battlepro'],
  Monorepos: ['exp-yagni', 'exp-kernelics'],
  'Teams of 5–12 Engineers': ['exp-kingpin', 'exp-kernelics', 'exp-battlepro'],
  'Customer Pilots & Demos': ['exp-yagni'],
  'Technical Hiring': ['exp-battlepro'],
  'System Architecture': ['exp-yagni', 'exp-sully', 'exp-battlepro'],
  'Mentoring (150+ Lectures)': ['exp-battlepro'],
  MCP: ['exp-yagni', 'exp-sully', 'exp-kingpin'],
  Kubernetes: ['exp-sully', 'exp-kingpin', 'exp-kernelics'],
  Docker: ['exp-yagni', 'exp-sully', 'exp-kingpin', 'exp-kernelics', 'exp-battlepro'],
  GCP: ['exp-yagni', 'exp-sully', 'exp-kingpin', 'exp-kernelics', 'exp-battlepro'],
  'Incident Response': ['exp-yagni', 'exp-sully', 'exp-kingpin', 'exp-kernelics', 'exp-battlepro'],
  MongoDB: ['exp-sully', 'exp-kingpin', 'exp-kernelics', 'exp-battlepro'],
  Playwright: ['exp-kingpin', 'exp-kernelics', 'exp-battlepro'],
  Cypress: ['exp-kernelics', 'exp-battlepro'],
  Jest: ['exp-yagni', 'exp-sully', 'exp-kingpin', 'exp-kernelics', 'exp-battlepro'],
  'Product Strategy': ['exp-yagni', 'exp-kingpin']
};

export const BLOG_POSTS: BlogPost[] = [
  {
    id: 'post-1',
    slug: 'engineering-management-systems-thinking',
    published: '2026-10-13',
    category: 'leadership',
    categoryLabel: { en: 'LEADERSHIP', ru: 'ЛИДЕРСТВО' },
    originalMinutes: 3,
    url: 'https://www.linkedin.com/posts/rossev_engineeringmanagement-systemsthinking-leadership-share-7515722598857650176-H9N0',
    title: {
      en: 'Engineering Management Is Applied Systems Thinking',
      ru: 'Инженерный менеджмент — это прикладное системное мышление'
    },
    takeaway: {
      en: 'Debug your team’s feedback loops, handoffs, and queue depth just like a distributed system.',
      ru: 'Отлаживайте циклы обратной связи и очереди в команде так же, как в распределённой системе.'
    },
    tags: ['Systems Thinking', 'Org Design'],
    brief: {
      quote: {
        en: 'An engineering organization is a distributed system where the nodes happen to be humans and AI agents.',
        ru: 'Инженерная организация — это распределённая система, где узлами выступают люди и AI-агенты.'
      },
      bullets: {
        en: [
          'Treat PR review queues, handoff delays, and context-switching like backpressure in a distributed message bus.',
          'When delivery slows down, inspect the system topology (ownership boundaries, approval gates, CI feedback time) before blaming individual throughput.',
          'Design small, autonomous loops with explicit interfaces so engineers spend time shipping rather than synchronizing.'
        ],
        ru: [
          'Рассматривайте очереди на код-ревью, задержки передачи задач и переключение контекста как backpressure в распределённой шине.',
          'Когда поставка замедляется, ищите узкие места в топологии процессов (границы ответственности, время прогона CI), а не в людях.',
          'Стройте автономные контуры с чёткими контрактами, чтобы команда тратила время на поставку, а не на бесконечные синхронизации.'
        ]
      }
    },
    color: 'var(--lime)'
  },
  {
    id: 'post-2',
    slug: 'every-engineering-estimate-is-two-things',
    published: '2026-10-19',
    category: 'delivery',
    categoryLabel: { en: 'DELIVERY', ru: 'ПОСТАВКА' },
    originalMinutes: 3,
    url: 'https://www.linkedin.com/posts/rossev_every-engineering-estimate-is-actually-two-share-7517918772553461760-fDtV',
    title: {
      en: 'Every Engineering Estimate Is Actually Two Separate Things',
      ru: 'Любая инженерная оценка состоит из двух разных вещей'
    },
    takeaway: {
      en: 'Separate probability sizing from deterministic business commitments.',
      ru: 'Разделяйте вероятностную оценку сложности и твёрдое обязательство к дате.'
    },
    tags: ['Estimates', 'Ownership'],
    brief: {
      quote: {
        en: 'Commit to outcomes and interfaces; keep scope modular behind feature flags.',
        ru: 'Берите обязательства по результату и контрактам, а объём держите модульным за фича-флагами.'
      },
      bullets: {
        en: [
          'Every estimate mixes two orthogonal concepts: (1) probabilistic discovery of unknown complexity and (2) a deterministic calendar commitment.',
          'Conflating the two forces engineers to pad estimates defensively or cut architectural corners to hit an arbitrary date.',
          'Scope the commitment around a core milestone with feature-flagged progressive depth so dates stay reliable without sacrificing quality.'
        ],
        ru: [
          'Любая оценка смешивает две разные вещи: (1) вероятностный прогноз неизвестной сложности и (2) твёрдое бизнесовое обязательство к дате.',
          'Когда их путают, инженеры либо перезакладываются втрое, либо режут углы в архитектуре ради дедлайна.',
          'Фиксируйте дату для ядра функциональности, а дополнительные сценарии закрывайте итеративно за фича-флагами.'
        ]
      }
    },
    color: 'var(--yellow)'
  },
  {
    id: 'post-3',
    slug: 'the-new-ai-bottleneck',
    published: '2026-10-19',
    category: 'ai',
    categoryLabel: { en: 'AI SYSTEMS', ru: 'AI-СИСТЕМЫ' },
    originalMinutes: 4,
    url: 'https://www.linkedin.com/posts/rossev_the-new-ai-bottleneck-ugcPost-7517920896150536192-7TGN',
    title: {
      en: 'The New AI Bottleneck Isn’t Generation — It’s Verification',
      ru: 'Новое узкое место AI — не генерация кода, а его верификация'
    },
    takeaway: {
      en: 'Harnesses, automated evals, and runtime observability separate AI toys from production.',
      ru: 'Именно харнессы, эвалы и observability отличают прототип от боевого продакшена.'
    },
    tags: ['AI Harnesses', 'Verification'],
    brief: {
      quote: {
        en: 'Making AI agents dependable in production is an evaluation and systems-hardening problem.',
        ru: 'Надёжность AI-агентов в продакшене — это задача верификации, песочниц и системной инженерии.'
      },
      bullets: {
        en: [
          'Generating code with LLMs is cheap; proving that generated code is safe, isolated, and regression-free under production load is the real bottleneck.',
          'Production AI requires deterministic harnesses: sandboxed code runners, realistic task benchmarks, and a second independent "judge" review pass.',
          'Autonomy is earned through a measurable track record on real engineering benchmarks, never assumed from a single demo.'
        ],
        ru: [
          'Генерация кода стала дешёвой; настоящее узкое место — доказать, что этот код безопасен, изолирован и не ломает прод.',
          'Боевой AI требует жёсткого харнесса: изолированных песочниц, реалистичных бенчмарков и независимой проверки вторым агентом-судьёй.',
          'Автономность агента зарабатывается статистикой успешных прогонов, а не эффектным демо.'
        ]
      }
    },
    color: 'var(--cyan)'
  },
  {
    id: 'post-4',
    slug: 'ai-agents-30-percent-more-code',
    published: '2026-10-23',
    category: 'ai',
    categoryLabel: { en: 'AI SYSTEMS', ru: 'AI-СИСТЕМЫ' },
    originalMinutes: 3,
    url: 'https://www.linkedin.com/posts/rossev_ai-agents-helped-developers-write-30-more-share-7519300584580087809-F6Qp',
    title: {
      en: 'AI Agents Helped Write 30% More Code. Then What?',
      ru: 'AI-агенты помогли писать на 30% больше кода. Что дальше?'
    },
    takeaway: {
      en: 'More code is a vanity metric if PR queues and incident rates spike alongside it.',
      ru: 'Больше строк кода — метрика тщеславия, если растут очереди на ревью и инциденты.'
    },
    tags: ['Agents', 'SDLC'],
    brief: {
      quote: {
        en: 'Code volume is a cost center; verified merged behavior is the asset.',
        ru: 'Объём кода — это издержки; актив — это проверенное поведение в продакшене.'
      },
      bullets: {
        en: [
          'Writing 30% more lines of code only creates 30% more review debt if the verification and merge pipeline stays manual and unguarded.',
          'Agent teams must own the whole loop from proposal to tested PR under a human-approved plan — including running tests and fixing their own failures.',
          'Measure end-to-end merged value and production stability, not raw token or LOC output.'
        ],
        ru: [
          'Плюс 30% сгенерированного кода превращаются в +30% долга на ревью, если конвейер проверки остаётся прежним.',
          'Команды агентов должны проходить весь цикл от утверждённого плана до протестированного PR, сами исправляя падения тестов в песочнице.',
          'Измеряйте доставленную в прод ценность и стабильность релизов, а не количество написанных строк.'
        ]
      }
    },
    color: 'var(--lime)'
  },
  {
    id: 'post-5',
    slug: 'attackers-kept-attacking-opencode',
    published: '2026-10-23',
    category: 'systems',
    categoryLabel: { en: 'RELIABILITY', ru: 'НАДЁЖНОСТЬ' },
    originalMinutes: 4,
    url: 'https://www.linkedin.com/posts/rossev_the-attackers-kept-attacking-opencodes-share-7519304575242207233-RIlc',
    title: {
      en: 'When Attackers Keep Hitting Your Infrastructure',
      ru: 'Когда инфраструктуру атакуют без остановки: закалка продакшена'
    },
    takeaway: {
      en: 'Blast-radius isolation, rate limiting, and anomaly telemetry must exist from day one.',
      ru: 'Изоляция радиуса поражения и телеметрия аномалий должны быть заложены с первого дня.'
    },
    tags: ['Resilience', 'Security'],
    brief: {
      quote: {
        en: 'Security and reliability are architectural boundaries, not after-the-fact patches.',
        ru: 'Безопасность и надёжность — это физические границы архитектуры, а не патчи задним числом.'
      },
      bullets: {
        en: [
          'Production runners and public endpoints face continuous automated probing, runaway payloads, and noisy-neighbor spikes.',
          'Hardening means ephemeral sandboxes, strict egress allowlists, per-organization data isolation, and an early-warning risk radar.',
          'Detect stalled or anomalous runs before the customer notices and isolate the blast radius to a single ephemeral container.'
        ],
        ru: [
          'Боевые раннеры и API постоянно сталкиваются с аномальными нагрузками, зависшими процессами и попытками пробить изоляцию.',
          'Защита строится на одноразовых песочницах, строгом разделении данных организаций и радаре раннего предупреждения.',
          'Ловите зависшие сборки раньше клиента и запирайте радиус поражения внутри одного изолированного контейнера.'
        ]
      }
    },
    color: 'var(--orange)'
  },
  {
    id: 'post-6',
    slug: 'technical-seniority-is-dead',
    published: '2026-10-18',
    category: 'leadership',
    categoryLabel: { en: 'LEADERSHIP', ru: 'ЛИДЕРСТВО' },
    originalMinutes: 3,
    url: 'https://www.linkedin.com/posts/rossev_technical-seniority-is-dead-ugcPost-7517626785531011072-jLGL',
    title: {
      en: 'Traditional Technical Seniority Is Dead — Ownership Remains',
      ru: 'Старый «сеньоритет» мёртв — остаётся только оунершип'
    },
    takeaway: {
      en: 'Seniority today is system design, trade-off judgment, and end-to-end outcome ownership.',
      ru: 'Настоящий сеньоритет сегодня — это архитектура, выбор компромиссов и ответственность за результат.'
    },
    tags: ['Seniority', 'Ownership'],
    brief: {
      quote: {
        en: 'Syntax is automated; architectural judgment and ownership are more valuable than ever.',
        ru: 'Синтаксис автоматизирован — архитектурное суждение и оунершип ценятся как никогда.'
      },
      bullets: {
        en: [
          'Memorizing framework syntax is no longer a differentiator when AI agents can scaffold boilerplate in seconds.',
          'True Staff/Senior leverage lies in problem framing, boundary design, failure-mode anticipation, and owning the production outcome.',
          'The best engineers operate as architects and judges: they define the plan, delegate execution to agents, and verify the critical invariants.'
        ],
        ru: [
          'Знание синтаксиса фреймворков больше не отличает сеньора, когда агент генерирует бойлерплейт за секунды.',
          'Настоящий уровень Staff/Senior сегодня — это постановка задачи, проектирование границ, предвидение сбоев и ответственность за прод.',
          'Сильные инженеры работают как архитекторы и судьи: утверждают план, делегируют рутину агентам и верифицируют ключевые инварианты.'
        ]
      }
    },
    color: 'var(--yellow)'
  },
  {
    id: 'post-7',
    slug: 'god-damn-5k-if-else',
    published: '2026-10-19',
    category: 'systems',
    categoryLabel: { en: 'RELIABILITY', ru: 'НАДЁЖНОСТЬ' },
    originalMinutes: 3,
    url: 'https://www.linkedin.com/posts/rossev_god-damn-5k-if-else-ugcPost-7517921822798016512-hRGL',
    title: {
      en: 'Anatomy of a 5,000-Line If-Else Monster in Production',
      ru: 'Анатомия монстра из 5 000 строк if-else в продакшене'
    },
    takeaway: {
      en: 'Without explicit domain boundaries and state machines, entropy always wins.',
      ru: 'Без чётких доменных границ и конечных автоматов энтропия всегда побеждает.'
    },
    tags: ['State Machines', 'Architecture'],
    brief: {
      quote: {
        en: 'Explicit state machines turn 5,000 lines of defensive branching into an auditable graph.',
        ru: 'Явный конечный автомат превращает 5 000 строк хрупких условий в проверяемый граф.'
      },
      bullets: {
        en: [
          'Every 5,000-line if-else monolith starts as "just one quick special case" added without an explicit state machine.',
          'In complex workflows (clinical voice intake, multi-tenant B2B pricing, agent handoffs), implicit flags create impossible-to-test state explosions.',
          'Replace nested branching with explicit finite state machines (FSM), typed contracts, and deterministic transition guards.'
        ],
        ru: [
          'Любой монстр из 5 000 строк if-else начинается с «одного маленького исключения», добавленного в обход конечного автомата.',
          'В сложных процессах (голосовой AI для клиник, оптовый B2B-прайсинг, оркестрация агентов) неявные флаги вызывают комбинаторный взрыв состояний.',
          'Заменяйте вложенные условия явными конечными автоматами (FSM), типизированными контрактами и детерминированными переходами.'
        ]
      }
    },
    color: 'var(--cyan)'
  },
  {
    id: 'post-8',
    slug: 'stop-using-llms-as-expensive-regex',
    published: '2026-10-16',
    category: 'ai',
    categoryLabel: { en: 'AI SYSTEMS', ru: 'AI-СИСТЕМЫ' },
    originalMinutes: 3,
    url: 'https://www.linkedin.com/posts/rossev_stop-using-llms-as-the-worlds-most-expensive-share-7516812934384152576-B7GT',
    title: {
      en: 'Stop Using LLMs as the World’s Most Expensive Regex',
      ru: 'Хватит использовать LLM как самую дорогую регулярку'
    },
    takeaway: {
      en: 'Combine fast deterministic code guardrails with LLMs only where ambiguity exists.',
      ru: 'Сочетайте детерминированный код с LLM только там, где реально есть нечёткость.'
    },
    tags: ['LLM Latency', 'Guardrails'],
    brief: {
      quote: {
        en: 'Let deterministic code guard the boundaries; let models handle the ambiguity inside.',
        ru: 'Пусть детерминированный код держит границы, а модели решают неоднозначность внутри них.'
      },
      bullets: {
        en: [
          'Routing deterministic parsing, validation, or schema checks through an LLM burns latency, money, and reliability.',
          'Use strict code (Zod schemas, AST parsers, state machines) for everything deterministic, and reserve LLM calls strictly for semantic reasoning.',
          'Hybrid architectures deliver sub-second latency and predictable production behavior.'
        ],
        ru: [
          'Гонять детерминированный парсинг, валидацию или маршрутизацию через LLM — значит сжигать задержку, бюджет и надёжность.',
          'Используйте строгий код (схемы, парсеры, автоматы) для всего предсказуемого, оставляя LLM только там, где нужно семантическое решение.',
          'Гибридная архитектура даёт минимальную задержку и предсказуемое поведение в бою.'
        ]
      }
    },
    color: 'var(--pink)'
  },
  {
    id: 'post-9',
    slug: 'explanation-vs-ownership',
    published: '2026-06-13',
    category: 'delivery',
    categoryLabel: { en: 'DELIVERY', ru: 'ПОСТАВКА' },
    originalMinutes: 3,
    url: 'https://www.linkedin.com/posts/rossev_explanation-vs-ownership-theres-a-massive-share-7471699825135308800-MENb',
    title: {
      en: 'Explanation vs. Ownership: Problems vs. Decisions',
      ru: 'Объяснения против Оунершипа: Проблемы против Решений'
    },
    takeaway: {
      en: 'Don’t escalate raw problems — bring trade-offs, options, and a recommended decision.',
      ru: 'Не приносите просто проблемы — приносите варианты, компромиссы и решение.'
    },
    tags: ['Decision Making', 'Execution'],
    brief: {
      quote: {
        en: 'Ownership means closing the loop with a permanent architectural fix.',
        ru: 'Оунершип — это закрытие цикла постоянным архитектурным превентивным фиксом.'
      },
      bullets: {
        en: [
          'Explaining why something failed is reporting; proposing three concrete recovery options with trade-offs and executing the fix is ownership.',
          'In early-stage startups and core platform teams, leaders value engineers who compress the loop from "incident detected" to "root cause resolved".',
          'Every post-mortem should end with a systemic guardrail or benchmark so the same class of failure cannot recur.'
        ],
        ru: [
          'Объяснить, почему всё упало — это отчёт; принести варианты решения с компромиссами и закрыть проблему — это оунершип.',
          'В продуктовых и платформенных командах ценятся инженеры, которые сжимают путь от обнаружения сбоя до системного фикса.',
          'Каждый разбор инцидента должен заканчиваться новым автотестом, бенчмарком или гардрейлом.'
        ]
      }
    },
    color: 'var(--orange)'
  }
];
