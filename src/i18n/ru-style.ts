// How the Russian copy is written (src/i18n/ru.ts, `ru` in src/data, the Publora prompt in
// scripts/ci/publora-sync.ts): the way an engineer writes for peers on Habr or in a work chat.
// - IT terms stay as engineers say them: Latin for names, titles and abbreviations (PR, CI/CD, LLM,
//   main, Founding Engineer); transliterated when said aloud and declined (мерж/смержить, фидбек,
//   фикс, гардрейл, харнесс, эвалы, фолбэк, тенант, деплой, прод, ревью). Never a "native" stand-in.
// - What sounds translated is structure: English word order, канцелярит, literal EN metaphors,
//   marketing words. First person, short sentences, verbs; the reader is «вы», lowercase.
// - Numbers: decimal comma (1,7 с), non-breaking space for thousands (8 320), Russian units (15 с,
//   220 мс), 98%, en dash ranges (220–250 мс). «Ёлочки», spaced em dash, ё everywhere.
// - One concept, one word: heal (NCA) заживает, regrow отрастает, brief конспект, case кейс, Book a
//   call «СОЗВОН ↗»; blog categories AI-системы, Лидерство, Системы, Деливери.
// RU_BANNED below is what tests/ru-style.test.ts (built pages) and the Publora validator (generated
// posts) reject: the fake-Russian stand-ins, literal translations of the EN scene metaphors and «ты».

// Cyrillic has no \b: a match must not continue a Russian word on the left.
export const RU_BANNED: [source: string, why: string][] = [
  // «влиться в команду» and «вливания» are ordinary Russian, not merge.
  ['влит(?!ься)[а-яё]*|влива(?!ни)[а-яё]*|влил[а-яё]*|вольё[а-яё]*', 'merge is «мерж/смержить», not «влить»'],
  ['закоммичен[а-яё]* красн', 'red test: «сначала красный тест»'],
  ['залеч[а-яё]*', 'NCA heals: «заживает»'],
  ['контур[а-яё]* само', 'self-improving loop: «цикл самоулучшения»'],
  ['арендатор[а-яё]*', 'tenant: «тенант» or «клиент»'],
  ['строительн[а-яё]* блок', 'building block: «кирпичик»'],
  ['сканир[а-яё]*', 'skim: «пробегать глазами»'],
  ['ярус[а-яё]*|бункер[а-яё]*|орбитальн[а-яё]*|укрепл[её]нн[а-яё]*|укрепил[а-яё]*', 'EN scene metaphor translated literally'],
  ['ГАРАНТИЯ:|ЗАЩИТА:', 'guardrail: «гардрейл»'],
  ['нанимаете под', 'hiring for: «ищете людей в»'],
  ['(?:ты|тебя|тебе|твой|твоя|твои|тво[её]|жд[её]шь|можешь|ответь|напиши|нажми|скажи|попробуй|проведи|посмотри|повреди)(?![а-яё])', 'the reader is «вы» everywhere'],
];

export const ruBannedRe = (source: string) => new RegExp(`(?<![а-яё])(?:${source})`, 'giu');

/** "«found» (why)" for every banned form in `text`; [] when it follows the guide. */
export const ruStyleProblems = (text: string) =>
  RU_BANNED.flatMap(([src, why]) => [...text.matchAll(ruBannedRe(src))].map((m) => `«${m[0]}» (${why})`));
