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
}

export interface BlogPost {
  id: string;
  slug: string;
  category: 'ai' | 'leadership' | 'systems' | 'delivery';
  categoryLabel: { en: string; ru: string };
  readTime: { en: string; ru: string };
  url: string;
  title: { en: string; ru: string };
  takeaway: { en: string; ru: string };
  tags: string[];
  color: string;
}

export const PROFILE = {
  name: {
    en: 'Gleb Rosev',
    ru: 'Глеб Росев'
  },
  // Version A (max 12 words):
  tagline: {
    en: 'STAFF ENGINEER @ YAGNI.APP // MAKING PRODUCTION AI AGENTS DEPENDABLE',
    ru: 'STAFF ENGINEER В YAGNI.APP // НАДЁЖНЫЕ AI-АГЕНТЫ ДЛЯ РАЗРАБОТКИ'
  },
  location: {
    en: 'Tbilisi, Georgia · Remote (US Team)',
    ru: 'Тбилиси, Грузия · Удалённо с командой в США'
  },
  phone: '+995 591 90 81 80',
  email: 'rossevgleb@gmail.com',
  linkedin: 'https://www.linkedin.com/in/rossev',
  linkedinHandle: 'linkedin.com/in/rossev',
  // Version B (50-70 words, first person, concrete, no hype):
  bio: {
    en: 'I am a Staff Engineer on the core team at YAGNI (yagni.app), working alongside the founders to make AI agent teams dependable in production, not just impressive in a demo. Our named agents—builders, reviewers, product managers—take work from proposal to merged GitHub PR under human-approved plans. Previously, I spent 8+ years leading teams and building Voice AI and distributed systems.',
    ru: 'Я Staff Engineer в основной команде американского стартапа YAGNI (yagni.app), где вместе с фаундерами делаю команды AI-агентов надёжными в реальной работе, а не только на демо. Наши агенты (разработчик, ревьюер, PM) ведут задачи в GitHub от идеи до смерженного PR по утверждённому человеком плану. За плечами — 8+ лет в архитектуре, голосовом AI и управлении командами.'
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
      value: 'YAGNI',
      label: { en: 'Staff Engineer (Core Team)', ru: 'Staff Engineer (Core Team)' },
      color: 'var(--cyan)'
    },
    {
      value: '400+',
      label: { en: 'Healthcare Orgs (Sully.ai)', ru: 'Клиник (в Sully.ai)' },
      color: 'var(--yellow)'
    },
    {
      value: '5–12',
      label: { en: 'Engineers Led', ru: 'Инженеров в командах' },
      color: 'var(--orange)'
    }
  ],
  selectedImpact: [
    {
      tag: { en: 'AGENT RELIABILITY', ru: 'НАДЁЖНОСТЬ АГЕНТОВ' },
      color: 'var(--lime)',
      title: { en: 'PRODUCTION-GRADE AI AGENTS', ru: 'AI-АГЕНТЫ ДЛЯ РЕАЛЬНОГО ПРОДАКШЕНА' },
      text: {
        en: 'Building realistic evaluation benchmarks, self-improving failure diagnostics, and sandboxed runners at YAGNI (yagni.app).',
        ru: 'Реалистичные бенчмарки качества, самообучающийся разбор сбоев и изолированное выполнение кода для агентских команд в YAGNI.'
      }
    },
    {
      tag: { en: 'LEADERSHIP', ru: 'ЛИДЕРСТВО' },
      color: 'var(--yellow)',
      title: { en: 'HANDS-ON TEAM LEADERSHIP', ru: 'ИГРАЮЩИЙ ЛИДЕР (5–12 ИНЖЕНЕРОВ)' },
      text: {
        en: 'Led cross-functional teams up to 12 people while actively shipping architecture and core backend/AI code.',
        ru: 'Управление кросс-функциональными командами до 12 человек с личным участием в коде и архитектуре.'
      }
    },
    {
      tag: { en: 'DELIVERY', ru: 'ПОСТАВКА' },
      color: 'var(--cyan)',
      title: { en: 'TRUNK-BASED & CANARY', ru: 'TRUNK-BASED И КАНАРЕЙКИ' },
      text: {
        en: 'Established feature-flagged trunk-based delivery from main across multi-environment microservices.',
        ru: 'Ежедневные релизы из main через фича-флаги и канареечные выкатки без простоев.'
      }
    },
    {
      tag: { en: 'OBSERVABILITY', ru: 'НАБЛЮДАЕМОСТЬ' },
      color: 'var(--pink)',
      title: { en: 'RISK RADAR & TELEMETRY', ru: 'РАДАР РИСКОВ И OBSERVABILITY' },
      text: {
        en: 'Designing early-warning risk radars, stalled-run detection, and Grafana/Loki/Mimir observability to catch issues before customers do.',
        ru: 'Радар раннего предупреждения сбоев, мониторинг зависших прогонов и сквозная телеметрия до обращения клиента.'
      }
    }
  ]
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: 'yagni',
    company: 'YAGNI (yagni.app)',
    period: 'OCT 2026 — PRESENT',
    location: 'US Startup (Remote)',
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
      { value: 'Core', label: { en: 'Staff Engineer', ru: 'Staff Engineer' } },
      { value: 'GitHub', label: { en: 'Proposal → Merged PR', ru: 'От плана до PR' } },
      { value: 'Radar', label: { en: 'Proactive Reliability', ru: 'Радар рисков' } }
    ],
    stack: ['Agent Benchmarks', 'Self-Improving Loops', 'Sandboxed Runner', 'Tenant Isolation', 'Risk Radar', 'GitHub Integration'],
    architecture: {
      en: {
        challenge: 'Making AI agent teams dependable in real customer codebases—where every action must be auditable, tenant data strictly isolated, and regressions caught before customers notice.',
        solution: 'Hardened the build/review agent pipeline and sandboxed code runner, built benchmarks modeled on realistic engineering tasks, and introduced an early-warning risk radar and self-improving failure analyzer.',
        outcomes: [
          'Built evaluation benchmarks of hard, realistic engineering tasks to measure whether changes make agents better or worse.',
          'Developed an experimental self-improving loop where agents inspect failed runs, identify root causes, and propose fixes for human review.',
          'Implemented build monitoring, stalled-run detection, and an early-warning risk radar to catch issues before pilot customers report them.',
          'Hardened the sandboxed code runner, build/review agents, and strict data isolation between customer organizations.'
        ],
        topology: [
          '[Human-Approved Plan] ──► [Named Agent Team: PM · Builder · Reviewer]',
          '[Sandboxed Code Runner + Org Isolation] ──► [Auditable GitHub PR]',
          '[Risk Radar & Stalled-Run Monitor] ──► [Self-Improving Root-Cause Agent]'
        ]
      },
      ru: {
        challenge: 'Сделать команды AI-агентов по-настоящему надёжными в продакшене: с прозрачным аудитом каждого шага, строгой изоляцией данных между организациями и защитой от регрессий.',
        solution: 'Укрепил пайплайн агентов сборки и ревью, изолированный раннер кода, создал бенчмарки на реальных инженерных задачах, радар рисков и систему анализа сбоев другими агентами.',
        outcomes: [
          'Разработал бенчмарки на сложных реалистичных задачах, показывающие, улучшает или ухудшает агентов каждое изменение.',
          'Создал экспериментальную систему, где агенты анализируют чужие прогоны, находят первопричины сбоев и предлагают фиксы команде.',
          'Внедрил мониторинг клиентских сборок, детекцию зависших прогонов и «радар рисков» для обнаружения проблем до жалоб клиентов.',
          'Укрепил агентов сборки и ревью, песочницу выполнения кода и изоляцию данных между организациями.'
        ],
        topology: [
          '[Утверждённый человеком план] ──► [Команда агентов: PM · Builder · Reviewer]',
          '[Изолированная песочница + Изоляция орг.] ──► [Проверяемый PR в GitHub]',
          '[Радар рисков и мониторинг прогонов] ──► [Агент поиска первопричин сбоев]'
        ]
      }
    }
  },
  {
    id: 'sully',
    company: 'Sully.ai',
    period: 'SEP 2025 — OCT 2026',
    location: 'US & MENA',
    color: 'var(--cyan)',
    badge: { en: 'VOICE AI & HARNESS', ru: 'ГОЛОСОВОЙ AI' },
    title: {
      en: 'Multilingual Voice AI & Runtime Diagnostic Harness',
      ru: 'Мультиязычный голосовой AI и система Runtime-диагностики'
    },
    summary: {
      en: 'Production AI employees for clinical workflows across real-time voice pipelines, telephony, evaluation harnesses, and backend services.',
      ru: 'AI-сотрудники для клиник: real-time голосовые пайплайны, телефония, эвалы и трассировка в продакшене.'
    },
    metrics: [
      { value: '400+', label: { en: 'Healthcare Orgs', ru: 'Клиник' } },
      { value: '100K+', label: { en: 'Providers', ru: 'Врачей' } },
      { value: 'Real-Time', label: { en: 'Voice Stream', ru: 'Телефония' } }
    ],
    stack: ['LiveKit', 'Twilio', 'Speechmatics', 'OpenAI / Claude / Gemini', 'TypeScript', 'Node.js', 'Agent Evals'],
    architecture: {
      en: {
        challenge: 'Enterprise healthcare launches demand low-latency multilingual voice over live telephony and immediate root-cause visibility.',
        solution: 'Engineered end-to-end voice & harness reliability layers spanning Twilio/LiveKit ingress, ASR/LLM orchestration, deterministic evals, and trace telemetry.',
        outcomes: [
          'Hardened multilingual voice pipelines across telephony, backend services, and operational tooling.',
          'Built evaluation and runtime-diagnostic workflows that isolate production failures in minutes.',
          'Trusted by 400+ healthcare organizations representing 100,000+ providers.'
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
          'Обеспечил отказоустойчивость мультиязычных голосовых пайплайнов под enterprise-нагрузкой.',
          'Разработал систему runtime-диагностики и оценки агентов для быстрой изоляции инцидентов.',
          'Платформа используется 400+ медицинскими организациями (100 000+ врачей).'
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
      en: 'Led 12 engineers shipping multi-tenant catalog/order workflows, ERP/CRM syncs, canary releases, and an LLM pipeline cutting triage time by 80%.',
      ru: 'Команда до 12 человек: мультитенантные заказы, синхронизация ERP/CRM, канареечные релизы и LLM-аналитика (-80% времени).'
    },
    metrics: [
      { value: '-80%', label: { en: 'Analysis Time', ru: 'Время триажа' } },
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
          '[Sales & CS Inputs] ──► [LLM Insight Pipeline] ──► [-80% Triage Time]'
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
    role: { en: 'Staff Engineer', ru: 'Staff Engineer' },
    company: 'YAGNI (yagni.app)',
    period: { en: 'Oct 2026 — Present', ru: 'Окт 2026 — Наст. время' },
    location: { en: 'Tbilisi, Georgia · Remote (US Team)', ru: 'Тбилиси, Грузия · Удалённо (США)' },
    domain: {
      en: 'Early-stage US startup building named AI agent teams that take engineering work from proposal to merged GitHub pull request under human-approved plans.',
      ru: 'Американский стартап ранней стадии, создающий команды именованных AI-агентов, которые доводят задачи от предложения до смерженного PR в GitHub под контролем человека.'
    },
    color: 'var(--lime)',
    metrics: ['Core Team', 'Agent Benchmarks', 'Risk Radar & Sandbox'],
    highlights: {
      en: [
        'Build evaluation benchmarks of hard, realistic engineering tasks modeled on customer work to measure whether changes improve or degrade agent performance.',
        'Develop an experimental self-improving system where agents review other agents’ runs, isolate root causes of failures, and propose fixes for the team.',
        'Engineer customer build monitoring, stalled-run detection, and an early-warning risk radar to surface production issues before customers report them.',
        'Harden core build and review agents, the sandboxed code runner, and strict data isolation between customer organizations.',
        'Serve as technical point of contact for pilot customers in my time zone, running demos, troubleshooting, and turning feedback into engineering work.'
      ],
      ru: [
        'Создаю бенчмарки на сложных реалистичных инженерных задачах, чтобы объективно проверять, делают ли изменения наших агентов лучше или хуже.',
        'Разрабатываю экспериментальную систему самообучения, где агенты анализируют чужие прогоны, находят первопричины сбоев и предлагают фиксы команде.',
        'Строю систему мониторинга клиентских сборок, детекции зависших прогонов и «радар рисков», предупреждающий о проблемах до обращения клиента.',
        'Укрепляю базовый пайплайн: агентов сборки и ревью, изолированную песочницу для запуска кода и разделение данных между организациями.',
        'Веду пилотных клиентов в своём часовом поясе как технический контакт: провожу демо, разбираю сбои и перевожу фидбек в инженерные задачи.'
      ]
    }
  },
  {
    id: 'exp-sully',
    role: { en: 'Staff AI Engineer — Harness & Voice Systems', ru: 'Staff AI Engineer — Harness & Voice Systems' },
    company: 'Sully.ai',
    period: { en: 'Sep 2025 — Oct 2026', ru: 'Сен 2025 — Окт 2026' },
    location: { en: 'Remote · US & MENA', ru: 'Удалённо · США и MENA' },
    domain: {
      en: 'Healthcare AI building clinical & administrative AI employees.',
      ru: 'AI-сотрудники для клинических и административных процессов в медицине.'
    },
    color: 'var(--cyan)',
    metrics: ['400+ Healthcare Orgs', '100K+ Providers', 'Real-Time Voice AI'],
    highlights: {
      en: [
        'Hardened production multilingual AI systems across real-time voice pipelines, telephony, backend, and operational tooling.',
        'Built evaluation, observability, and runtime-diagnostic harnesses that isolated production failures fast.',
        'Drove stress testing, incident investigation, and deployment reliability for enterprise healthcare launches.'
      ],
      ru: [
        'Разрабатывал и укреплял мультиязычные голосовые AI-пайплайны, телефонию, бэкенд и операционный тулинг.',
        'Создал процессы оценки (evals), observability и runtime-диагностики для быстрой локализации сбоев.',
        'Отвечал за стресс-тестирование, разбор инцидентов и надёжность релизов для 400+ клиник и 100K+ врачей.'
      ]
    }
  },
  {
    id: 'exp-kingpin',
    role: { en: 'Engineering Manager / Senior Full-Stack', ru: 'Engineering Manager / Senior Full-Stack' },
    company: 'Kingpin',
    period: { en: 'Sep 2024 — Aug 2025', ru: 'Сен 2024 — Авг 2025' },
    location: { en: 'Dubai, UAE', ru: 'Дубай, ОАЭ' },
    domain: {
      en: 'AI-powered multi-tenant B2B SaaS platform for wholesale.',
      ru: 'AI-платформа и мультитенантный B2B SaaS для дистрибуции.'
    },
    color: 'var(--yellow)',
    metrics: ['12 Engineers Led', '-80% Triage Time', 'Canary Releases'],
    highlights: {
      en: [
        'Led a cross-functional team of up to 12 people while staying active in architecture and code.',
        'Delivered multi-tenant catalog/order workflows with ERP/CRM syncs and feature-flagged trunk-based releases.',
        'Built an LLM feedback pipeline converting Sales/CS input into product insights (-80% analysis time).'
      ],
      ru: [
        'Руководил командой до 12 человек, совмещая управление поставкой с работой в коде и архитектуре.',
        'Запустил мультитенантные заказы с ERP/CRM интеграциями, фича-флагами и мониторингом в Grafana.',
        'Создал LLM-пайплайн анализа фидбека от Sales и CS, ускоривший продуктовый триаж на 80%.'
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

export const BLOG_POSTS: BlogPost[] = [
  {
    id: 'post-1',
    slug: 'engineering-management-systems-thinking',
    category: 'leadership',
    categoryLabel: { en: 'LEADERSHIP', ru: 'ЛИДЕРСТВО' },
    readTime: { en: '3 MIN', ru: '3 МИН' },
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
    color: 'var(--lime)'
  },
  {
    id: 'post-2',
    slug: 'every-engineering-estimate-is-two-things',
    category: 'delivery',
    categoryLabel: { en: 'DELIVERY', ru: 'ПОСТАВКА' },
    readTime: { en: '3 MIN', ru: '3 МИН' },
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
    color: 'var(--yellow)'
  },
  {
    id: 'post-3',
    slug: 'the-new-ai-bottleneck',
    category: 'ai',
    categoryLabel: { en: 'AI SYSTEMS', ru: 'AI-СИСТЕМЫ' },
    readTime: { en: '4 MIN', ru: '4 МИН' },
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
    color: 'var(--cyan)'
  },
  {
    id: 'post-4',
    slug: 'ai-agents-30-percent-more-code',
    category: 'ai',
    categoryLabel: { en: 'AI SYSTEMS', ru: 'AI-СИСТЕМЫ' },
    readTime: { en: '3 MIN', ru: '3 МИН' },
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
    color: 'var(--lime)'
  },
  {
    id: 'post-5',
    slug: 'attackers-kept-attacking-opencode',
    category: 'systems',
    categoryLabel: { en: 'RELIABILITY', ru: 'НАДЁЖНОСТЬ' },
    readTime: { en: '4 MIN', ru: '4 МИН' },
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
    color: 'var(--orange)'
  },
  {
    id: 'post-6',
    slug: 'technical-seniority-is-dead',
    category: 'leadership',
    categoryLabel: { en: 'LEADERSHIP', ru: 'ЛИДЕРСТВО' },
    readTime: { en: '3 MIN', ru: '3 МИН' },
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
    color: 'var(--yellow)'
  },
  {
    id: 'post-7',
    slug: 'god-damn-5k-if-else',
    category: 'systems',
    categoryLabel: { en: 'RELIABILITY', ru: 'НАДЁЖНОСТЬ' },
    readTime: { en: '3 MIN', ru: '3 МИН' },
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
    color: 'var(--cyan)'
  },
  {
    id: 'post-8',
    slug: 'stop-using-llms-as-expensive-regex',
    category: 'ai',
    categoryLabel: { en: 'AI SYSTEMS', ru: 'AI-СИСТЕМЫ' },
    readTime: { en: '3 MIN', ru: '3 МИН' },
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
    color: 'var(--pink)'
  },
  {
    id: 'post-9',
    slug: 'explanation-vs-ownership',
    category: 'delivery',
    categoryLabel: { en: 'DELIVERY', ru: 'ПОСТАВКА' },
    readTime: { en: '3 MIN', ru: '3 МИН' },
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
    color: 'var(--orange)'
  }
];

export const BLOG_MOMENTUM = {
  pulseSeries: [
    { label: 'W1', pct: 22 },
    { label: 'W2', pct: 34 },
    { label: 'W3', pct: 28 },
    { label: 'W4', pct: 46 },
    { label: 'W5', pct: 42 },
    { label: 'W6', pct: 58 },
    { label: 'W7', pct: 64 },
    { label: 'W8', pct: 54 },
    { label: 'W9', pct: 76 },
    { label: 'W10', pct: 84 },
    { label: 'W11', pct: 94 },
    { label: 'W12', pct: 100 }
  ],
  coreThemes: [
    {
      title: { en: 'Agent Teams & Evals', ru: 'Команды агентов и Эвалы' },
      desc: { en: 'Benchmarks, sandboxes & verification', ru: 'Бенчмарки, песочницы и проверка' },
      color: 'var(--lime)'
    },
    {
      title: { en: 'Systems Thinking', ru: 'Системное мышление' },
      desc: { en: 'Org bottlenecks & ownership', ru: 'Процессы и оунершип' },
      color: 'var(--yellow)'
    },
    {
      title: { en: 'Prod Reliability', ru: 'Надёжность в бою' },
      desc: { en: 'Risk radars & canary ops', ru: 'Радары рисков и канарейки' },
      color: 'var(--cyan)'
    }
  ],
  audienceBreakdown: [
    { label: { en: 'Senior & Staff Engineers', ru: 'Senior и Staff инженеры' }, badge: { en: 'CORE', ru: 'ЯДРО' } },
    { label: { en: 'Founders, VPs & EMs', ru: 'Фаундеры, VP и EM' }, badge: { en: 'LEADERS', ru: 'ЛИДЕРЫ' } },
    { label: { en: 'AI & Distributed Systems', ru: 'AI и распред. системы' }, badge: { en: 'FOCUS', ru: 'ДОМЕН' } },
    { label: { en: 'US · UK · EU · Georgia', ru: 'США · Британия · ЕС' }, badge: { en: 'GLOBAL', ru: 'ХАБЫ' } }
  ]
};
