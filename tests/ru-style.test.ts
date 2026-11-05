// The Russian copy follows src/i18n/ru-style.ts: IT terms stay as engineers say them (мерж, фидбек,
// гардрейл), and what the guide bans is the fake-Russian stand-ins, literal translations of the EN
// scene metaphors and «ты». Checks every built file, scripts included: canvas captions and the
// topology live in JS, and only the RU copy has Cyrillic, so EN pages cannot trip it.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildSite } from './fixtures/build';

import { RU_BANNED, ruBannedRe, ruStyleProblems } from '../src/i18n/ru-style';
import { ru } from '../src/i18n/ru';
import { BLOG_POSTS } from '../src/data/posts';
import { CATEGORY_LABELS } from '../scripts/ci/publora-sync';

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
  buildSite();
  walk('dist');
});

describe('the banned list', () => {
  test('catches the stand-ins and «ты», passes the IT terms the guide keeps', () => {
    expect(ruStyleProblems('Влито в main. Пока ждёшь: ЗАЩИТА: тенант').length).toBe(3);
    expect(ruStyleProblems('Смерженный PR, фидбек, фикс, ГАРДРЕЙЛ: харнесс, эвалы, влияние, ответственность')).toEqual([]);
    expect(ruStyleProblems('Ответьте на письмо, влиться в команду, финансовые вливания, укрепление')).toEqual([]);
    for (const bad of ['PR влили в main', 'залечит разрез', 'Укрепил CI/CD', 'укрепленный агент', 'Нажми Enter', 'ты', 'сканируют резюме'])
      expect(ruStyleProblems(bad).length).toBe(1);
  });
});

describe('RU copy follows src/i18n/ru-style.ts', () => {
  test('built pages contain Russian copy at all', () => {
    expect(readFileSync('dist/ru/index.html', 'utf8')).toMatch(/[а-яё]{4}/i);
  });

  // Values and dates are shared strings unless localized: «8+ YRS», «15s → 0s», «NOV 2026 — PRESENT».
  test('/ru/ pages show no English units, counts or dates', () => {
    const EN = /\b\d+(?:[.,]\d+)?\+?\s?(?:YRS|ENG|ms|s)\b|\b\d+ PRs\b|\bPRESENT\b|\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\w* \d{4}\b/gi;
    const hits: string[] = [];
    for (const f of files.filter((f) => f.startsWith('dist/ru/') && f.endsWith('.html'))) {
      const html = readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
        // Quoted GitHub data (a PR title without titleRu, commit subjects) is marked lang="en" on purpose.
        .replace(/<(\w+)\b[^>]*\slang="en"[^>]*>[^<]*<\/\1>/g, '');
      for (const m of html.matchAll(EN)) hits.push(`${f}: …${html.slice(Math.max(0, m.index! - 40), m.index! + 30)}…`);
    }
    expect(hits).toEqual([]);
  });

  test('blog categories carry the guide labels, and the filters match them', () => {
    const labels = Object.fromEntries(BLOG_POSTS.map((p) => [p.category, p.categoryLabel.ru]));
    const want = { ai: 'AI-СИСТЕМЫ', leadership: 'ЛИДЕРСТВО', systems: 'СИСТЕМЫ', delivery: 'ДЕЛИВЕРИ' } as Record<string, string>;
    for (const [c, l] of Object.entries(labels)) expect(l).toBe(want[c]);
    expect(Object.values(CATEGORY_LABELS).map((l) => l.ru)).toEqual(Object.values(want));
    const w = ru.writing;
    expect([w.filterAi, w.filterLeadership, w.filterSystems, w.filterDelivery].map((s) => s.toUpperCase())).toEqual(Object.values(want));
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
