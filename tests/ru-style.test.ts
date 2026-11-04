// The Russian copy follows docs/ru-style.md: IT terms stay as engineers say them (мерж, фидбек,
// гардрейл), and what the guide bans is the fake-Russian stand-ins, literal translations of the EN
// scene metaphors and «ты». Checks every built file, scripts included: canvas captions and the
// topology live in JS, and only the RU copy has Cyrillic, so EN pages cannot trip it.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { RU_BANNED, ruBannedRe, ruStyleProblems } from '../src/i18n/ru-style';

setDefaultTimeout(180_000);

const BANNED = RU_BANNED.map(([src, why]) => [ruBannedRe(src), why] as const);

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

describe('the banned list', () => {
  test('catches the stand-ins and «ты», passes the IT terms the guide keeps', () => {
    expect(ruStyleProblems('Влито в main. Пока ждёшь: ЗАЩИТА: тенант').length).toBe(3);
    expect(ruStyleProblems('Смерженный PR, фидбек, фикс, ГАРДРЕЙЛ: харнесс, эвалы, влияние, ответственность')).toEqual([]);
  });
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
