// Loaded with the interactive topology. Both locales are available when the page switches language.
const en = {
  expanded: '3D EXPLODED // {node}',
  overview: '3 DECKS · CLICK ANY 3D NODE TO EXPLODE',
  xray: 'CAD X-RAY WIREFRAME ACTIVE',
  tracing: 'TRACING 3-DECK TOPOLOGY...',
  stage1: 'STAGE 1/5 · FAULT INJECTED ON {node}',
  stage2: 'STAGE 2/5 · ORBITAL RADAR (08) LOCKED STALLED RUN',
  stage3: 'STAGE 3/5 · SUB-VAULT (05/06) BLAST RADIUS ISOLATED',
  stage4: 'STAGE 4/5 · SELF-FIX (07) + JUDGE (04) ROOT-CAUSE PATCH',
  stage5: 'STAGE 5/5 · RECOVERED & VERIFIED ACROSS ALL 3 DECKS',
  resolved: 'INCIDENT RESOLVED · ZERO CUSTOMER IMPACT',
  complete: 'TRACE COMPLETE · ALL 3 DECKS HEALTHY'
};

const ru = {
  expanded: 'УЗЕЛ В РАЗРЕЗЕ · {node}',
  overview: '3 СЛОЯ · НАЖМИТЕ НА УЗЕЛ, ЧТОБЫ ПОСМОТРЕТЬ СЛОИ',
  xray: 'ВКЛЮЧЁН КАРКАСНЫЙ ВИД',
  tracing: 'ИДЁТ ТРАССИРОВКА ТРЁХ СЛОЁВ…',
  stage1: 'ЭТАП 1/5 · СБОЙ В УЗЛЕ {node}',
  stage2: 'ЭТАП 2/5 · РАДАР (08) ОБНАРУЖИЛ ЗАВИСШИЙ ПРОЦЕСС',
  stage3: 'ЭТАП 3/5 · УЗЛЫ 05 И 06 ИЗОЛИРОВАЛИ ЗОНУ СБОЯ',
  stage4: 'ЭТАП 4/5 · УЗЛЫ 07 И 04 УСТРАНЯЮТ ПРИЧИНУ СБОЯ',
  stage5: 'ЭТАП 5/5 · РАБОТА ВСЕХ ТРЁХ СЛОЁВ ВОССТАНОВЛЕНА И ПРОВЕРЕНА',
  resolved: 'СБОЙ УСТРАНЁН · КЛИЕНТЫ НЕ ПОСТРАДАЛИ',
  complete: 'ТРАССИРОВКА ЗАВЕРШЕНА · ВСЕ ТРИ СЛОЯ РАБОТАЮТ'
} satisfies Record<keyof typeof en, string>;

export const isoStatus = { en, ru };
