// The Russian copy follows docs/ru-style.md: IT terms stay as engineers say them (мерж, фидбек,
// гардрейл), and what the guide bans is the fake-Russian stand-ins, literal translations of the EN
// scene metaphors and «ты». Checks every built file, scripts included: canvas captions and the
// topology live in JS, and only the RU copy has Cyrillic, so EN pages cannot trip it.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

setDefaultTimeout(180_000);

// Cyrillic has no \b: a match must not continue a Russian word on the left.
const w = (src: string) => new RegExp(`(?<![а-яё])(?:${src})`, 'giu');
export const BANNED: [RegExp, string][] = [
  [w('влит[а-яё]*|влива[а-яё]*'), 'merge is «мерж/смержить», not «влить»'],
  [w('закоммичен[а-яё]* красн'), 'red test: «сначала красный тест»'],
  [w('залечива[а-яё]*'), 'NCA heals: «заживает»'],
  [w('контур[а-яё]* само'), 'self-improving loop: «цикл самоулучшения»'],
  [w('арендатор[а-яё]*'), 'tenant: «тенант» or «клиент»'],
  [w('строительн[а-яё]* блок'), 'building block: «кирпичик»'],
  [w('сканирует'), 'skim: «пробегать глазами»'],
  [w('ярус[а-яё]*|бункер[а-яё]*|орбитальн[а-яё]*|укреплённ[а-яё]*'), 'EN scene metaphor translated literally'],
  [w('ГАРАНТИЯ:|ЗАЩИТА:'), 'guardrail: «гардрейл»'],
  [w('нанимаете под'), 'hiring for: «ищете людей в»'],
  [w('ждёшь|ответь|напиши|можешь|тебе|твой|твоя'), 'the reader is «вы» everywhere'],
];

const files: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|js|json|txt|xml)$/.test(e.name)) files.push(p);
  }
};

beforeAll(() => {
  execSync('bun run build', { stdio: 'ignore' });
  walk('dist');
});

describe('RU copy follows docs/ru-style.md', () => {
  test('built pages contain Russian copy at all', () => {
    expect(readFileSync('dist/ru/index.html', 'utf8')).toMatch(/[а-яё]{4}/i);
  });

  for (const [re, why] of BANNED)
    test(`no ${re.source}: ${why}`, () => {
      const hits: string[] = [];
      for (const f of files) {
        const text = readFileSync(f, 'utf8');
        for (const m of text.matchAll(re)) hits.push(`${f}: …${text.slice(Math.max(0, m.index! - 30), m.index! + 40)}…`);
      }
      expect(hits).toEqual([]);
    });
});
