// What docs/ru-style.md bans in the Russian copy, as patterns: fake-Russian stand-ins for IT terms
// (engineers say мерж, фидбек, гардрейл), literal translations of the EN scene metaphors and «ты».
// One list for tests/ru-style.test.ts (built pages) and the Publora validator (generated posts).

// Cyrillic has no \b: a match must not continue a Russian word on the left.
export const RU_BANNED: [source: string, why: string][] = [
  ['влит[а-яё]*|влива[а-яё]*', 'merge is «мерж/смержить», not «влить»'],
  ['закоммичен[а-яё]* красн', 'red test: «сначала красный тест»'],
  ['залечива[а-яё]*', 'NCA heals: «заживает»'],
  ['контур[а-яё]* само', 'self-improving loop: «цикл самоулучшения»'],
  ['арендатор[а-яё]*', 'tenant: «тенант» or «клиент»'],
  ['строительн[а-яё]* блок', 'building block: «кирпичик»'],
  ['сканирует', 'skim: «пробегать глазами»'],
  ['ярус[а-яё]*|бункер[а-яё]*|орбитальн[а-яё]*|укреплённ[а-яё]*', 'EN scene metaphor translated literally'],
  ['ГАРАНТИЯ:|ЗАЩИТА:', 'guardrail: «гардрейл»'],
  ['нанимаете под', 'hiring for: «ищете людей в»'],
  ['(?:ждёшь|ответь|напиши|можешь|тебе|твой|твоя)(?![а-яё])', 'the reader is «вы» everywhere'],
];

export const ruBannedRe = (source: string) => new RegExp(`(?<![а-яё])(?:${source})`, 'giu');

/** "«found» (why)" for every banned form in `text`; [] when it follows the guide. */
export const ruStyleProblems = (text: string) =>
  RU_BANNED.flatMap(([src, why]) => [...text.matchAll(ruBannedRe(src))].map((m) => `«${m[0]}» (${why})`));
