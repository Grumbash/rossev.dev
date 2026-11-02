export interface BilingualText {
  en: string;
  ru: string;
}

export interface NodeSubLayer {
  tag: string;
  desc: BilingualText;
}

export interface TopologyNode {
  num: string;
  code: string;
  short: string;
  metric: string;
  stratum: -1 | 0 | 1;
  baseY: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  type: 'monolith' | 'reactor' | 'tower' | 'cage' | 'radar';
  top: string;
  left: string;
  right: string;
  spec: BilingualText;
  layers: NodeSubLayer[];
  guard: BilingualText;
}

export interface TopologyDomain {
  caseId: string;
  edges: [number, number][];
  nodes: TopologyNode[];
}

export const ISO_DOMAINS: Record<'yagni' | 'voice' | 'saas', TopologyDomain> = {
  yagni: {
    caseId: 'yagni',
    edges: [
      [0, 1], [1, 2], [1, 3], [2, 4], [3, 4],
      [4, 5], [3, 7], [6, 1], [7, 6], [5, 7]
    ],
    nodes: [
      {
        num: '01', code: '01 · PLAN & GITHUB', short: 'PLAN & PR', metric: 'HUMAN PLAN',
        stratum: 0, baseY: 0, x: -205, z: 155, w: 18, d: 18, h: 36, type: 'monolith',
        top: '#C8FF00', left: '#99C200', right: '#6B8700',
        spec: { en: 'Proposal to Merged GitHub PR under a Human-Approved Plan', ru: 'От предложения до смерженного PR в GitHub по утверждённому плану' },
        layers: [
          { tag: 'L3 · PR MERGE GATE', desc: { en: 'Human sign-off & GitHub review record', ru: 'Подтверждение человеком и запись в GitHub PR' } },
          { tag: 'L2 · PLAN COMPILER', desc: { en: 'Breaks proposal into verifiable engineering steps', ru: 'Декомпозиция задачи в проверяемый инженерный план' } },
          { tag: 'L1 · GITHUB WEBHOOKS', desc: { en: 'Repo context sync, branches & diff ingestion', ru: 'Синхронизация репозитория, веток и диффов' } }
        ],
        guard: { en: 'GUARDRAIL: Zero unapproved merges — autonomy is earned via track record.', ru: 'ГАРДРЕЙЛ: Никаких мержей без плана — автономность зарабатывается историей прогонов.' }
      },
      {
        num: '02', code: '02 · AGENT CORE', short: 'AGENT CORE', metric: 'PM · BUILD · REV',
        stratum: 0, baseY: 0, x: -15, z: 15, w: 22, d: 22, h: 54, type: 'reactor',
        top: '#00E5FF', left: '#00B2C7', right: '#007C8C',
        spec: { en: 'Named AI Agent Team (PM, Builder, Reviewer) Working Like an Engineering Team', ru: 'Команда именованных AI-агентов (PM, Builder, Reviewer), работающая как команда' },
        layers: [
          { tag: 'L3 · PM & HANDOFF ROUTER', desc: { en: 'Coordinates Builder, Reviewer & Judge turns', ru: 'Координация шагов между PM, Builder и Reviewer' } },
          { tag: 'L2 · CONTEXT MEMORY', desc: { en: 'Shared repo state & deterministic task graph', ru: 'Общее состояние репозитория и граф задач' } },
          { tag: 'L1 · AUDIT LEDGER', desc: { en: 'Every decision leaves a human-inspectable trace', ru: 'Каждый шаг оставляет проверяемый человеком след' } }
        ],
        guard: { en: 'GUARDRAIL: Deterministic handoff contracts prevent infinite agent loops.', ru: 'ГАРДРЕЙЛ: Жёсткие контракты передачи хода исключают зацикливание агентов.' }
      },
      {
        num: '03', code: '03 · BUILDER AGENT', short: 'BUILDER', metric: 'CODE & TESTS',
        stratum: 0, baseY: 0, x: -175, z: -35, w: 17, d: 17, h: 42, type: 'tower',
        top: '#00E5FF', left: '#00B2C7', right: '#007C8C',
        spec: { en: 'Hardened Builder Agent Writing Production Code & Automated Tests', ru: 'Укреплённый агент-разработчик (Builder), пишущий продакшен-код и тесты' },
        layers: [
          { tag: 'L3 · PATCH SYNTHESIS', desc: { en: 'Multi-file AST-aware edits & migrations', ru: 'Многофайловые изменения кода и миграции' } },
          { tag: 'L2 · TEST HARNESS GEN', desc: { en: 'Writes & runs unit/integration specs first', ru: 'Генерация и прогон тестов перед отправкой ревьюеру' } },
          { tag: 'L1 · TOOL CALL DRIVER', desc: { en: 'Dispatches builds down to Sub-Vault Sandbox (05)', ru: 'Отправка сборок вниз в изолированный бункер-песочницу (05)' } }
        ],
        guard: { en: 'GUARDRAIL: Code never leaves Builder without passing sandboxed test suite.', ru: 'ГАРДРЕЙЛ: Код не передаётся дальше без зелёного прогона в песочнице.' }
      },
      {
        num: '04', code: '04 · REVIEWER & JUDGE', short: 'JUDGE & PR', metric: '2ND PASS',
        stratum: 0, baseY: 0, x: 20, z: -130, w: 18, d: 18, h: 44, type: 'tower',
        top: '#FFD600', left: '#C7A700', right: '#8F7800',
        spec: { en: 'Reviewer & Second Judge Agent Verifying Output Before Human Decision', ru: 'Агент-ревьюер и второй агент-судья для проверки перед решением человека' },
        layers: [
          { tag: 'L3 · SECOND JUDGE AGENT', desc: { en: 'Independent critique against approved plan', ru: 'Независимая проверка вторым агентом-судьёй по плану' } },
          { tag: 'L2 · REGRESSION SCAN', desc: { en: 'Static analysis, security & edge-case checks', ru: 'Статический анализ, проверка безопасности и краевых кейсов' } },
          { tag: 'L1 · REJECTION LOOP', desc: { en: 'Returns actionable diff comments to Builder (03)', ru: 'Возврат конкретных замечаний по диффу обратно в Builder (03)' } }
        ],
        guard: { en: 'GUARDRAIL: Separate Judge model context eliminates self-confirmation bias.', ru: 'ГАРДРЕЙЛ: Изолированный контекст судьи исключает самоодобрение ошибок.' }
      },
      {
        num: '05', code: '05 · SANDBOX RUNNER', short: 'SANDBOX', metric: 'SUB-VAULT L-1',
        stratum: -1, baseY: -68, x: 35, z: 165, w: 19, d: 19, h: 36, type: 'cage',
        top: '#FFD600', left: '#C7A700', right: '#8F7800',
        spec: { en: 'Subterranean Sandboxed Code Runner Executing Customer Builds Safely', ru: 'Подземный изолированный раннер (Sub-Vault L-1) для безопасного запуска сборок' },
        layers: [
          { tag: 'L3 · EPHEMERAL VM POD', desc: { en: 'Single-run micro-sandbox destroyed after build', ru: 'Одноразовый микро-контейнер, уничтожаемый после сборки' } },
          { tag: 'L2 · EGRESS FIREWALL', desc: { en: 'Strict network policy & dependency allowlist', ru: 'Строгая сетевая политика и контроль внешних пакетов' } },
          { tag: 'L1 · CPU / MEM QUOTA', desc: { en: 'Kills runaway processes & infinite test loops', ru: 'Аппаратные лимиты против зависших процессов' } }
        ],
        guard: { en: 'GUARDRAIL: Untrusted agent code runs strictly in Sub-Vault L-1 (-68m).', ru: 'ГАРДРЕЙЛ: Весь сгенерированный код выполняется строго в нижнем бункере L-1.' }
      },
      {
        num: '06', code: '06 · ORG ISOLATION', short: 'ORG VAULT', metric: 'TENANT LOCK',
        stratum: -1, baseY: -68, x: 190, z: 95, w: 18, d: 18, h: 34, type: 'cage',
        top: '#B388FF', left: '#8B62D9', right: '#5E3DA8',
        spec: { en: 'Strict Data & Secret Isolation Between Customer Organizations', ru: 'Строгое разделение данных, ключей и окружений между организациями клиентов' },
        layers: [
          { tag: 'L3 · PER-ORG KMS KEYS', desc: { en: 'Scoped credentials & zero cross-tenant memory', ru: 'Отдельные ключи шифрования и полная изоляция памяти' } },
          { tag: 'L2 · STORAGE BOUNDARY', desc: { en: 'Isolated artifact & repository volumes', ru: 'Физическое разделение хранилищ артефактов и кода' } },
          { tag: 'L1 · ZERO-LEAK AUDIT', desc: { en: 'Cryptographic tenant boundary verification', ru: 'Криптографическая проверка границ арендатора' } }
        ],
        guard: { en: 'GUARDRAIL: Zero shared state between customer orgs at storage or runtime.', ru: 'ГАРДРЕЙЛ: Никакого общего состояния между организациями клиентов.' }
      },
      {
        num: '07', code: '07 · SELF-IMPROVING', short: 'SELF-FIX', metric: 'ORBITAL L+1',
        stratum: 1, baseY: 74, x: -135, z: -185, w: 18, d: 18, h: 38, type: 'tower',
        top: '#FF3385', left: '#C72466', right: '#8C1444',
        spec: { en: 'Orbital Meta-Agents Reviewing Failed Runs, Finding Root Causes & Proposing Fixes', ru: 'Орбитальная мета-система (L+1): разбор упавших прогонов и поиск первопричин' },
        layers: [
          { tag: 'L3 · FIX PROPOSAL PR', desc: { en: 'Drafts harness/prompt patches for team approval', ru: 'Формирует предложения по фиксу для решения команды' } },
          { tag: 'L2 · ROOT-CAUSE MINER', desc: { en: 'Clusters failed trajectories & tool errors', ru: 'Кластеризация сбоев и поиск корневой причины в трейсах' } },
          { tag: 'L1 · RUN TRACE INGEST', desc: { en: 'Streams failed runs from Risk Radar (08)', ru: 'Приём телеметрии проблемных сборок от Радара (08)' } }
        ],
        guard: { en: 'GUARDRAIL: Self-improvement proposals require benchmark proof + human sign-off.', ru: 'ГАРДРЕЙЛ: Любое улучшение агента проверяется на бенчмарке и утверждается командой.' }
      },
      {
        num: '08', code: '08 · EVALS & RADAR', short: 'RISK RADAR', metric: 'EARLY WARN',
        stratum: 1, baseY: 74, x: 195, z: -65, w: 19, d: 19, h: 46, type: 'radar',
        top: '#FF5500', left: '#CC4400', right: '#943000',
        spec: { en: 'Realistic Customer Benchmarks & Early-Warning Stalled-Run Risk Radar', ru: 'Реалистичные бенчмарки и орбитальный радар раннего обнаружения зависших сборок' },
        layers: [
          { tag: 'L3 · EARLY-WARN RADAR', desc: { en: 'Detects stalled customer builds before customer reports', ru: 'Обнаруживает проблему у клиента раньше самого клиента' } },
          { tag: 'L2 · REALISTIC EVALS', desc: { en: 'Hard engineering benchmarks modelled on real work', ru: 'Сложные бенчмарки, смоделированные по реальным задачам' } },
          { tag: 'L1 · REGRESSION GATE', desc: { en: 'Shows whether a change makes agents better or worse', ru: 'Точно показывает, стало ли качество агентов лучше или хуже' } }
        ],
        guard: { en: 'GUARDRAIL: Proactive stall detection alerts engineering before customer impact.', ru: 'ГАРДРЕЙЛ: Раннее обнаружение зависаний до того, как о них напишет клиент.' }
      }
    ]
  },
  voice: {
    caseId: 'sully',
    edges: [
      [0, 1], [1, 2], [1, 3], [2, 4], [3, 4],
      [4, 5], [3, 7], [6, 1], [7, 6], [5, 7]
    ],
    nodes: [
      {
        num: '01', code: '01 · TWILIO & LIVEKIT', short: 'SIP / WEBRTC', metric: '<35ms RTT',
        stratum: 0, baseY: 0, x: -205, z: 155, w: 18, d: 18, h: 36, type: 'monolith',
        top: '#C8FF00', left: '#99C200', right: '#6B8700',
        spec: { en: 'Low-Latency Twilio SIP & LiveKit WebRTC Audio Router (<35ms RTT)', ru: 'Двусторонний аудио-стриминг через Twilio SIP и LiveKit WebRTC (<35 мс)' },
        layers: [
          { tag: 'L3 · BARGE-IN HANDLER', desc: { en: 'Instant caller interruption & duplex audio flush', ru: 'Мгновенная обработка перебивания и сброс буфера' } },
          { tag: 'L2 · LIVEKIT WEBRTC', desc: { en: 'Jitter-buffered 24kHz PCM frame transport', ru: 'Транспорт аудио-фреймов 24 кГц с защитой от джиттера' } },
          { tag: 'L1 · TWILIO SIP TRUNK', desc: { en: 'Hospital PSTN telephony ingress & failover', ru: 'Входящая телефония клиник и автоматический фейловер' } }
        ],
        guard: { en: 'GUARDRAIL: Sub-35ms audio frame routing keeps conversations natural.', ru: 'ГАРДРЕЙЛ: Маршрутизация быстрее 35 мс удерживает естественный темп диалога.' }
      },
      {
        num: '02', code: '02 · VOICE AI HARNESS', short: 'VOICE CORE', metric: 'ORCHESTRATOR',
        stratum: 0, baseY: 0, x: -15, z: 15, w: 22, d: 22, h: 54, type: 'reactor',
        top: '#00E5FF', left: '#00B2C7', right: '#007C8C',
        spec: { en: 'Core Voice AI Harness Combining LLM Reasoning with State Machines', ru: 'Центральный харнесс голосового AI: оркестрация LLM и конечных автоматов' },
        layers: [
          { tag: 'L3 · DIALOGUE PLANNER', desc: { en: 'Low-latency streaming LLM response synthesizer', ru: 'Потоковая генерация ответов LLM с минимальной задержкой' } },
          { tag: 'L2 · FSM ORCHESTRATOR', desc: { en: 'Strict state transitions for clinical workflows', ru: 'Конечный автомат клинических сценариев приёма' } },
          { tag: 'L1 · VOICE TTS STREAM', desc: { en: 'Chunked phoneme synthesis & prosody control', ru: 'Потоковый синтез речи с контролем интонации' } }
        ],
        guard: { en: 'GUARDRAIL: Hybrid FSM + LLM prevents off-script medical hallucinations.', ru: 'ГАРДРЕЙЛ: Гибрид FSM и LLM исключает отклонение от медицинского протокола.' }
      },
      {
        num: '03', code: '03 · SPEECHMATICS ASR', short: 'ASR STREAM', metric: '24kHz LIVE',
        stratum: 0, baseY: 0, x: -175, z: -35, w: 17, d: 17, h: 42, type: 'tower',
        top: '#00E5FF', left: '#00B2C7', right: '#007C8C',
        spec: { en: 'Multilingual Streaming ASR & Clinical Turn-Detection Pipeline', ru: 'Потоковое мультиязычное распознавание речи и детекция пауз' },
        layers: [
          { tag: 'L3 · SEMANTIC VAD', desc: { en: 'Distinguishes patient pause from end-of-turn', ru: 'Отличает паузу на раздумье от конца реплики пациента' } },
          { tag: 'L2 · MEDICAL LEXICON', desc: { en: 'Drug names, dosages & ICD-10 terminology boost', ru: 'Словарь препаратов, дозировок и терминов МКБ-10' } },
          { tag: 'L1 · MULTI-LANG ASR', desc: { en: 'Real-time partial transcript streaming', ru: 'Потоковая транскрибация на нескольких языках' } }
        ],
        guard: { en: 'GUARDRAIL: Acoustic + semantic turn detection prevents cutting off patients.', ru: 'ГАРДРЕЙЛ: Семантический детектор пауз не перебивает пациента на полуслове.' }
      },
      {
        num: '04', code: '04 · STATE GUARDRAILS', short: 'GUARDRAILS', metric: 'DETERMINISTIC',
        stratum: 0, baseY: 0, x: 20, z: -130, w: 18, d: 18, h: 44, type: 'tower',
        top: '#FFD600', left: '#C7A700', right: '#8F7800',
        spec: { en: 'Deterministic State Guardrails Preventing Clinical Hallucinations', ru: 'Детерминированные гардрейлы, исключающие галлюцинации в медпроцессах' },
        layers: [
          { tag: 'L3 · CLINICAL POLICY', desc: { en: 'Blocks unverified medical advice or diagnosis', ru: 'Блокировка непроверенных медицинских рекомендаций' } },
          { tag: 'L2 · SLOT VERIFIER', desc: { en: 'Confirms DOB, insurance & appointment slots', ru: 'Верификация даты рождения, страховки и слота записи' } },
          { tag: 'L1 · HUMAN ESCALATION', desc: { en: 'Warm SIP transfer to clinic staff on edge cases', ru: 'Мгновенный перевод звонка на регистратуру при нештатном кейсе' } }
        ],
        guard: { en: 'GUARDRAIL: 100% deterministic verification before any EHR write operation.', ru: 'ГАРДРЕЙЛ: Стопроцентная детерминированная проверка перед записью в МИС.' }
      },
      {
        num: '05', code: '05 · TOOL CONTRACTS', short: 'SCHEMA BOX', metric: 'SUB-VAULT L-1',
        stratum: -1, baseY: -68, x: 35, z: 165, w: 19, d: 19, h: 36, type: 'cage',
        top: '#FFD600', left: '#C7A700', right: '#8F7800',
        spec: { en: 'Strict Schema Validation Synchronizing Voice Agent, Backend & UI', ru: 'Строгая валидация контрактов между голосовым агентом, бэкендом и UI' },
        layers: [
          { tag: 'L3 · ZOD / JSON SCHEMA', desc: { en: 'Strict runtime payload validation on tool calls', ru: 'Строгая runtime-валидация аргументов при вызове тулов' } },
          { tag: 'L2 · IDEMPOTENCY KEY', desc: { en: 'Prevents duplicate appointment bookings', ru: 'Защита от дублирования записи при повторном вызове' } },
          { tag: 'L1 · RETRY SANDBOX', desc: { en: 'Auto-repairs malformed LLM tool payloads', ru: 'Автоисправление невалидных JSON-вызовов от модели' } }
        ],
        guard: { en: 'GUARDRAIL: Malformed LLM tool calls are caught in Sub-Vault L-1 before execution.', ru: 'ГАРДРЕЙЛ: Невалидные вызовы инструментов перехватываются в бункере L-1.' }
      },
      {
        num: '06', code: '06 · EHR ADAPTER VAULT', short: 'EHR VAULT', metric: '400+ ORGS',
        stratum: -1, baseY: -68, x: 190, z: 95, w: 18, d: 18, h: 34, type: 'cage',
        top: '#B388FF', left: '#8B62D9', right: '#5E3DA8',
        spec: { en: 'Isolated Clinical EHR Integration Trusted by 400+ Healthcare Orgs', ru: 'Изолированная интеграция с клиниками для 400+ медорганизаций' },
        layers: [
          { tag: 'L3 · FHIR / HL7 BRIDGE', desc: { en: 'Normalized clinical record & schedule adapters', ru: 'Единый адаптер расписаний и медкарт FHIR / HL7' } },
          { tag: 'L2 · PHI ENCRYPTION', desc: { en: 'Scoped patient data vault & PII redaction', ru: 'Шифрование персональных медданных и очистка логов' } },
          { tag: 'L1 · CIRCUIT BREAKER', desc: { en: 'Graceful queueing when hospital EHR is slow', ru: 'Буферизация запросов при тормозах внешней МИС клиники' } }
        ],
        guard: { en: 'GUARDRAIL: Isolated per-clinic EHR credentials across 400+ healthcare orgs.', ru: 'ГАРДРЕЙЛ: Полная изоляция учётных данных клиник (400+ медорганизаций).' }
      },
      {
        num: '07', code: '07 · STRESS TEST SUITE', short: 'STRESS SIM', metric: 'ORBITAL L+1',
        stratum: 1, baseY: 74, x: -135, z: -185, w: 18, d: 18, h: 38, type: 'tower',
        top: '#FF3385', left: '#C72466', right: '#8C1444',
        spec: { en: 'Automated Concurrent Call Stress-Testing & Evaluation Harnesses', ru: 'Орбитальный симулятор (L+1): стресс-тесты и пайплайны оценки звонков' },
        layers: [
          { tag: 'L3 · ADVERSARIAL CALLS', desc: { en: 'Simulates noisy, accented & edge-case patients', ru: 'Симуляция фонового шума, акцентов и сложных пациентов' } },
          { tag: 'L2 · CONCURRENCY LOAD', desc: { en: 'Spikes parallel SIP streams before release', ru: 'Нагрузочное тестирование параллельных звонков перед релизом' } },
          { tag: 'L1 · LATENCY SCORER', desc: { en: 'Measures P95 turn-to-turn response times', ru: 'Контроль P95-задержки ответа на каждом шаге диалога' } }
        ],
        guard: { en: 'GUARDRAIL: Every voice prompt & harness change runs through synthetic callers.', ru: 'ГАРДРЕЙЛ: Каждое изменение проверяется сотнями синтетических звонков.' }
      },
      {
        num: '08', code: '08 · TRACE DIAGNOSTICS', short: 'TRACE RADAR', metric: '100K+ DOCS',
        stratum: 1, baseY: 74, x: 195, z: -65, w: 19, d: 19, h: 46, type: 'radar',
        top: '#FF5500', left: '#CC4400', right: '#943000',
        spec: { en: 'Runtime Diagnostics Isolating Production Call Incidents in Minutes', ru: 'Орбитальный радар диагностики: локализация инцидентов в звонках за минуты' },
        layers: [
          { tag: 'L3 · TIMELINE REPLAY', desc: { en: 'Frame-accurate audio + ASR + LLM + Tool timeline', ru: 'Посекундная синхронизация аудио, ASR, LLM и вызовов тулов' } },
          { tag: 'L2 · DRIFT DETECTOR', desc: { en: 'Flags latency spikes or ASR degradation live', ru: 'Мгновенное обнаружение деградации задержек или распознавания' } },
          { tag: 'L1 · INCIDENT TRIAGE', desc: { en: 'Cuts root-cause debugging from hours to minutes', ru: 'Сокращение разбора прод-инцидентов с часов до минут' } }
        ],
        guard: { en: 'GUARDRAIL: Full end-to-end call observability across audio, LLM & EHR.', ru: 'ГАРДРЕЙЛ: Сквозная трассировка звонка от аудиопотока до ответа МИС.' }
      }
    ]
  },
  saas: {
    caseId: 'kingpin',
    edges: [
      [0, 1], [1, 2], [1, 3], [2, 4], [3, 4],
      [4, 5], [3, 7], [6, 1], [7, 6], [5, 7]
    ],
    nodes: [
      {
        num: '01', code: '01 · GATEWAY & FLAGS', short: 'CANARY GW', metric: 'TRUNK MAIN',
        stratum: 0, baseY: 0, x: -205, z: 155, w: 18, d: 18, h: 36, type: 'monolith',
        top: '#C8FF00', left: '#99C200', right: '#6B8700',
        spec: { en: 'Trunk-Based Delivery Gateway with Feature Flags & Canary Rollouts', ru: 'Канареечный API-шлюз и поставка из main через фича-флаги' },
        layers: [
          { tag: 'L3 · CANARY ROUTER', desc: { en: 'Progressive tenant rollout & instant kill-switch', ru: 'Поэтапная раскатка на клиентов и мгновенный откат' } },
          { tag: 'L2 · FEATURE FLAG SDK', desc: { en: 'Decouples deployment from business release', ru: 'Отделение деплоя кода в прод от включения фичи' } },
          { tag: 'L1 · RATE & AUTH EDGE', desc: { en: 'JWT tenant scoping & DDoS throttling', ru: 'Проверка прав арендатора и лимитирование запросов' } }
        ],
        guard: { en: 'GUARDRAIL: Trunk-based deploys to main with sub-second feature flag rollback.', ru: 'ГАРДРЕЙЛ: Прямая поставка из main с мгновенным отключением через фича-флаги.' }
      },
      {
        num: '02', code: '02 · NESTJS B2B CORE', short: 'B2B CORE', metric: '220ms TTFB',
        stratum: 0, baseY: 0, x: -15, z: 15, w: 22, d: 22, h: 54, type: 'reactor',
        top: '#00E5FF', left: '#00B2C7', right: '#007C8C',
        spec: { en: 'Transactional Multi-Tenant B2B Core Engine (220ms TTFB)', ru: 'Транзакционное ядро мультитенантной B2B-платформы (220 мс TTFB)' },
        layers: [
          { tag: 'L3 · ORDER WORKFLOW', desc: { en: 'Wholesale checkout, credit limits & approvals', ru: 'Оптовый чекаут, кредитные лимиты и цепочки согласования' } },
          { tag: 'L2 · DOMAIN SERVICES', desc: { en: 'Modular NestJS bounded contexts & CQRS', ru: 'Модульные доменные сервисы NestJS с чёткими границами' } },
          { tag: 'L1 · QUERY PIPELINE', desc: { en: 'Optimized read projections (850ms -> 220ms TTFB)', ru: 'Оптимизированные выборки (снижение TTFB с 850 до 220 мс)' } }
        ],
        guard: { en: 'GUARDRAIL: 4x faster TTFB (220ms) under heavy multi-tenant wholesale load.', ru: 'ГАРДРЕЙЛ: Четырёхкратное ускорение ответа (220 мс) под оптовой нагрузкой.' }
      },
      {
        num: '03', code: '03 · CATALOG & PRICING', short: 'CATALOG', metric: 'TIERED B2B',
        stratum: 0, baseY: 0, x: -175, z: -35, w: 17, d: 17, h: 42, type: 'tower',
        top: '#00E5FF', left: '#00B2C7', right: '#007C8C',
        spec: { en: 'High-Speed B2B Catalog, Custom Contract Pricing & Bulk Rules', ru: 'Высокоскоростной каталог, индивидуальные B2B-цены и правила скидок' },
        layers: [
          { tag: 'L3 · CONTRACT PRICING', desc: { en: 'Per-account price matrices & volume tiers', ru: 'Индивидуальные прайс-листы и скидки от объёма' } },
          { tag: 'L2 · INVENTORY ALLOC', desc: { en: 'Real-time warehouse stock reservation', ru: 'Резервирование остатков по складам в реальном времени' } },
          { tag: 'L1 · SEARCH INDEXER', desc: { en: 'Faceted SKU filtering across 100k+ items', ru: 'Фасетный поиск по сотням тысяч товарных позиций' } }
        ],
        guard: { en: 'GUARDRAIL: Zero price-calculation drift between catalog view and invoice.', ru: 'ГАРДРЕЙЛ: Полное совпадение расчёта цен между витриной и финальным счётом.' }
      },
      {
        num: '04', code: '04 · ERP & CRM SYNC', short: 'ERP SYNC', metric: 'IDEMPOTENT',
        stratum: 0, baseY: 0, x: 20, z: -130, w: 18, d: 18, h: 44, type: 'tower',
        top: '#FFD600', left: '#C7A700', right: '#8F7800',
        spec: { en: 'Bidirectional ERP & CRM Event Workers with Dead-Letter Recovery', ru: 'Идемпотентные воркеры двусторонней синхронизации с ERP и CRM' },
        layers: [
          { tag: 'L3 · OUTBOX DISPATCH', desc: { en: 'Transactional outbox guarantees zero lost events', ru: 'Паттерн Transactional Outbox исключает потерю событий' } },
          { tag: 'L2 · IDEMPOTENT SYNC', desc: { en: 'Safe retries across NetSuite / HubSpot / ERP', ru: 'Идемпотентная синхронизация заказов и контрагентов' } },
          { tag: 'L1 · DLQ AUTO-REPLAY', desc: { en: 'Dead-letter queue inspection & self-recovery', ru: 'Очередь проблемных сообщений с автоматическим допрогоном' } }
        ],
        guard: { en: 'GUARDRAIL: Outbox + idempotency keys eliminate duplicate ERP invoices.', ru: 'ГАРДРЕЙЛ: Ключи идемпотентности исключают дубли счетов во внешней ERP.' }
      },
      {
        num: '05', code: '05 · POSTGRES ACID DB', short: 'POSTGRES DB', metric: 'SUB-VAULT L-1',
        stratum: -1, baseY: -68, x: 35, z: 165, w: 19, d: 19, h: 36, type: 'cage',
        top: '#FFD600', left: '#C7A700', right: '#8F7800',
        spec: { en: 'Tenant-Scoped PostgreSQL Cluster with Strict Transactional Guarantees', ru: 'Подземный кластер PostgreSQL (L-1) со строгими ACID-транзакциями' },
        layers: [
          { tag: 'L3 · SERIALIZABLE TX', desc: { en: 'Prevents double-spend on inventory & credit', ru: 'Защита от гонок при списании баланса и остатков' } },
          { tag: 'L2 · COMPOSITE INDEXES', desc: { en: 'Eliminated N+1 queries across tenant joins', ru: 'Устранение N+1 запросов и профилирование планов выполнения' } },
          { tag: 'L1 · ZERO-DOWNTIME MIG', desc: { en: 'Expand-contract schema migrations in prod', ru: 'Безопасные миграции БД без остановки продакшена' } }
        ],
        guard: { en: 'GUARDRAIL: Row-level tenant scoping + zero-downtime schema evolution.', ru: 'ГАРДРЕЙЛ: Изоляция данных на уровне строк и миграции без простоя.' }
      },
      {
        num: '06', code: '06 · REDIS LOCK & CACHE', short: 'REDIS VAULT', metric: 'SUB-MS',
        stratum: -1, baseY: -68, x: 190, z: 95, w: 18, d: 18, h: 34, type: 'cage',
        top: '#B388FF', left: '#8B62D9', right: '#5E3DA8',
        spec: { en: 'Distributed Redis Cache & Concurrency Lock Manager', ru: 'Распределённый кеш и менеджер блокировок Redis для пиковых нагрузок' },
        layers: [
          { tag: 'L3 · REDLOCK MUTEX', desc: { en: 'Distributed locks for concurrent cart updates', ru: 'Распределённые блокировки при параллельном редактировании заказа' } },
          { tag: 'L2 · TENANT CACHE TAGS', desc: { en: 'Instant surgical cache invalidation on price edit', ru: 'Точечная инвалидация кеша при обновлении прайс-листов' } },
          { tag: 'L1 · BULLMQ STREAMS', desc: { en: 'High-throughput background job queues', ru: 'Высоконагруженные очереди фоновых задач' } }
        ],
        guard: { en: 'GUARDRAIL: Stampede protection & deterministic cache invalidation.', ru: 'ГАРДРЕЙЛ: Защита от пробоя кеша и мгновенный сброс устаревших цен.' }
      },
      {
        num: '07', code: '07 · LLM INSIGHTS', short: 'LLM TRIAGE', metric: 'ORBITAL L+1',
        stratum: 1, baseY: 74, x: -135, z: -185, w: 18, d: 18, h: 38, type: 'tower',
        top: '#FF3385', left: '#C72466', right: '#8C1444',
        spec: { en: 'Automated LLM Sales/CS Feedback Pipeline (-80% Manual Triage Time)', ru: 'Орбитальный LLM-конвейер (L+1): анализ фидбека от Sales и CS (-80% времени)' },
        layers: [
          { tag: 'L3 · PRODUCT SIGNALS', desc: { en: 'Ranks feature requests by revenue impact', ru: 'Ранжирование продуктовых запросов по влиянию на выручку' } },
          { tag: 'L2 · STRUCTURED EXTRACT', desc: { en: 'Turns raw call notes & tickets into typed schemas', ru: 'Превращение сырых заметок и тикетов в типизированные отчёты' } },
          { tag: 'L1 · CS / SALES INGEST', desc: { en: 'Automated ingestion from CRM & support channels', ru: 'Автоматический сбор обращений из CRM и каналов поддержки' } }
        ],
        guard: { en: 'GUARDRAIL: Cut manual feedback triage time by 80% for product leadership.', ru: 'ГАРДРЕЙЛ: Сокращение ручной обработки фидбека на 80%.' }
      },
      {
        num: '08', code: '08 · GRAFANA & LOKI SLO', short: 'SLO RADAR', metric: '99.95% SLA',
        stratum: 1, baseY: 74, x: 195, z: -65, w: 19, d: 19, h: 46, type: 'radar',
        top: '#FF5500', left: '#CC4400', right: '#943000',
        spec: { en: 'Full-Stack Observability (Grafana, Loki, Mimir) & Proactive Alerting', ru: 'Орбитальный стек наблюдаемости (Grafana, Loki, Mimir) и SLO-алертинг' },
        layers: [
          { tag: 'L3 · BURN-RATE ALERTS', desc: { en: 'Pages on SLO error-budget burn before outage', ru: 'Алерты по скорости выгорания бюджета ошибок до падения сервиса' } },
          { tag: 'L2 · CORRELATED LOGS', desc: { en: 'TraceID links frontend request to SQL query', ru: 'Единый TraceID от клика в браузере до SQL-запроса в БД' } },
          { tag: 'L1 · MIMIR & LOKI', desc: { en: 'High-cardinality metrics & structured log stream', ru: 'Сбор метрик высокой кардинальности и структурированных логов' } }
        ],
        guard: { en: 'GUARDRAIL: Early warning observability cut incident MTTR across all services.', ru: 'ГАРДРЕЙЛ: Сквозная наблюдаемость радикально снизила время реакции (MTTR).' }
      }
    ]
  }
};
