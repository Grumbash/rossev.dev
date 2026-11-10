// /hire answers "who can I bring in for this?" for people, Google and answer engines alike. Gleb is all
// in on YAGNI: the page offers a YAGNI pilot and his talks, each with the proof already on the site and
// one booking link, and shows the retired offers as a diff, struck out, each pointing where it went. No
// prices: a call comes first. The same offers reach JSON-LD and /llms.txt from one source.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { OFFERS, RETIRED_OFFERS } from '../src/data/profile';
import { PLACEMENTS } from '../src/scripts/analytics';
import { buildSite } from './fixtures/build';

setDefaultTimeout(120_000);

const PAGES = { en: 'dist/hire/index.html', ru: 'dist/ru/hire/index.html' } as const;
const html: Record<string, string> = {};

beforeAll(() => {
  buildSite();
  for (const [l, f] of Object.entries(PAGES)) html[l] = existsSync(f) ? readFileSync(f, 'utf8') : '';
});

const graphOf = (page: string): any[] => {
  const raw = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}';
  const ld = JSON.parse(raw);
  return ld['@graph'] ?? [ld];
};
const hrefs = (page: string) => [...page.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const fileOf = (path: string) => `dist${path.replace(/[?#].*$/, '')}index.html`;

const YAGNI_ID = 'https://yagni.app/#organization';
const PERSON_ID = 'https://rossev.dev/#person';

describe('offers', () => {
  test('a YAGNI pilot and talks, each in both languages', () => {
    expect(OFFERS.map((o) => [o.id, o.by])).toEqual([['pilot', 'yagni'], ['talks', 'gleb']]);
    for (const o of OFFERS)
      for (const l of ['en', 'ru'] as const) {
        expect(o.name[l].trim().length, `${o.id}.name.${l}`).toBeGreaterThan(0);
        expect(o.forWho[l].trim().length, `${o.id}.forWho.${l}`).toBeGreaterThan(0);
        expect(o.youGet[l].length, `${o.id}.youGet.${l}`).toBeGreaterThan(0);
        expect(o.proof.length, `${o.id}.proof`).toBeGreaterThan(0);
      }
  });

  test('audit, advisory and full-time roles are retired, each saying where it went', () => {
    expect(RETIRED_OFFERS.map((r) => r.id)).toEqual(['audit', 'advisory', 'roles']);
    const ids = OFFERS.map((o) => o.id);
    for (const r of RETIRED_OFFERS) {
      expect(ids).not.toContain(r.id);
      if (r.to) expect(ids).toContain(r.to);
      for (const l of ['en', 'ru'] as const) {
        expect(r.was[l].trim().length, `${r.id}.was.${l}`).toBeGreaterThan(0);
        expect(r.now[l].trim().length, `${r.id}.now.${l}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('/hire page', () => {
  test('is built in both languages, each offer with its own heading', () => {
    for (const l of ['en', 'ru'] as const) {
      expect(html[l], PAGES[l]).not.toBe('');
      expect(html[l]).toContain(`<html lang="${l}"`);
      for (const o of OFFERS) expect(html[l]).toContain(`id="${o.id}"`);
    }
  });

  test('the retired offers are a diff: struck out, and their old anchors still land on them', () => {
    for (const l of ['en', 'ru'] as const) {
      const diff = html[l].match(/<section[^>]*class="[^"]*hire-diff[\s\S]*?<\/section>/)?.[0] ?? '';
      expect(diff, l).not.toBe('');
      for (const r of RETIRED_OFFERS) {
        expect(diff).toContain(`id="${r.id}"`);
        expect(diff).toMatch(new RegExp(`<del\\b[^>]*>${r.was[l]}</del>`));
        if (r.to) expect(diff).toContain(`href="#${r.to}"`);
      }
      // The diff comes before the offers: it says why the page changed, then what is on it.
      expect(html[l].indexOf('hire-diff')).toBeLessThan(html[l].indexOf('id="pilot"'));
    }
  });

  test('shows no prices: the first step is a call', () => {
    // The print-only CV (tests/print.test.ts) is a CV, not an offer: its "$10M+ in investment" is no price.
    for (const l of ['en', 'ru'] as const) expect(html[l].replace(/<section[^>]*class="print-cv"[\s\S]*?<\/section>/, '')).not.toMatch(/[$€₽]\s?\d|\d\s?(?:USD|EUR)/);
  });

  test('every cal.com link is tagged with the hire placement', () => {
    expect(PLACEMENTS as readonly string[]).toContain('hire');
    for (const l of ['en', 'ru'] as const) {
      const cal = [...html[l].matchAll(/<a[^>]+href="(https:\/\/cal\.com[^"]+)"[^>]*>/g)];
      expect(cal.length).toBeGreaterThan(0);
      for (const [tag, href] of cal) {
        expect(new URL(href.replace(/&amp;/g, '&')).searchParams.get('utm_content')).toBe('hire');
        expect(tag).toContain('data-track-placement="hire"');
      }
    }
  });

  test('every proof link opens a page that exists on the site', () => {
    for (const l of ['en', 'ru'] as const) {
      const local = hrefs(html[l]).filter((h) => h.startsWith('/') && !/\.(pdf|txt|svg|png)$/.test(h));
      for (const h of local) expect(existsSync(fileOf(h)), `${l}: ${h}`).toBe(true);
    }
  });

  test('JSON-LD: YAGNI offers the pilot, Gleb (who works for YAGNI) offers talks; no price, nothing retired', () => {
    for (const l of ['en', 'ru'] as const) {
      const graph = graphOf(html[l]);
      const person = graph.find((n) => n['@type'] === 'Person');
      const yagni = graph.find((n) => n['@type'] === 'Organization');
      expect(person?.['@id']).toBe(PERSON_ID);
      expect(person.worksFor).toEqual({ '@id': YAGNI_ID });
      expect(yagni?.['@id']).toBe(YAGNI_ID);
      expect(yagni.url).toBe('https://yagni.app');
      for (const [node, by, id] of [[person, 'gleb', PERSON_ID], [yagni, 'yagni', YAGNI_ID]] as const) {
        const mine = OFFERS.filter((o) => o.by === by);
        const offers = node.makesOffer ?? [];
        expect(offers.length).toBe(mine.length);
        offers.forEach((o: any, i: number) => {
          expect(o['@type']).toBe('Offer');
          expect(o.price).toBeUndefined();
          expect(o.priceSpecification).toBeUndefined();
          expect(o.itemOffered['@type']).toBe('Service');
          expect(o.itemOffered.name).toBe(mine[i].name[l]);
          expect(o.itemOffered.provider).toEqual({ '@id': id });
          expect(o.url).toBe(`https://rossev.dev${l === 'en' ? '' : '/ru'}/hire/#${mine[i].id}`);
        });
      }
      const ld = JSON.stringify(graph);
      for (const r of RETIRED_OFFERS) expect(ld).not.toContain(r.was[l]);
    }
  });
});

describe('links to /hire', () => {
  test('the nav on every page links it in the page language', () => {
    expect(hrefs(readFileSync('dist/index.html', 'utf8'))).toContain('/hire/');
    expect(hrefs(readFileSync('dist/ru/index.html', 'utf8'))).toContain('/ru/hire/');
    expect(hrefs(readFileSync('dist/how-its-built/index.html', 'utf8'))).toContain('/hire/');
  });

  test('the sitemap lists both languages', () => {
    const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
    expect(xml).toContain('<loc>https://rossev.dev/hire/</loc>');
    expect(xml).toContain('<loc>https://rossev.dev/ru/hire/</loc>');
  });

  test('/llms.txt names every offer and links the page', () => {
    const llms = readFileSync('dist/llms.txt', 'utf8');
    const section = llms.split('\n## ').find((s) => s.startsWith('Work with me')) ?? '';
    expect(section).toContain('https://rossev.dev/hire/');
    for (const o of OFFERS) expect(section).toContain(o.name.en);
    // Answer engines should not offer what he no longer does: retired offers appear only as retired.
    for (const r of RETIRED_OFFERS) expect(section).not.toContain(`**${r.was.en}**`);
    expect(section).toMatch(/all in on YAGNI/);
  });
});
