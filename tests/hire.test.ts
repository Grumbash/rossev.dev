// /hire answers "who can I bring in for this?" for people, Google and answer engines alike: every way
// to work with Gleb, each with the proof already on the site and one booking link. No prices: a call
// comes first. The same offers reach JSON-LD (Person.makesOffer) and /llms.txt from one source.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { OFFERS } from '../src/data/profile';
import { PLACEMENTS } from '../src/scripts/analytics';

setDefaultTimeout(120_000);

const PAGES = { en: 'dist/hire/index.html', ru: 'dist/ru/hire/index.html' } as const;
const html: Record<string, string> = {};

beforeAll(() => {
  execSync('bun run build', { stdio: 'ignore' });
  for (const [l, f] of Object.entries(PAGES)) html[l] = existsSync(f) ? readFileSync(f, 'utf8') : '';
});

const graphOf = (page: string): any[] => {
  const raw = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}';
  const ld = JSON.parse(raw);
  return ld['@graph'] ?? [ld];
};
const hrefs = (page: string) => [...page.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const fileOf = (path: string) => `dist${path.replace(/[?#].*$/, '')}index.html`;

describe('offers', () => {
  test('audit, advisory, talks and full-time roles, each in both languages', () => {
    expect(OFFERS.map((o) => o.id)).toEqual(['audit', 'advisory', 'talks', 'roles']);
    for (const o of OFFERS)
      for (const l of ['en', 'ru'] as const) {
        expect(o.name[l].trim().length, `${o.id}.name.${l}`).toBeGreaterThan(0);
        expect(o.forWho[l].trim().length, `${o.id}.forWho.${l}`).toBeGreaterThan(0);
        expect(o.youGet[l].length, `${o.id}.youGet.${l}`).toBeGreaterThan(0);
        expect(o.proof.length, `${o.id}.proof`).toBeGreaterThan(0);
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

  test('shows no prices: the first step is a call', () => {
    for (const l of ['en', 'ru'] as const) expect(html[l]).not.toMatch(/[$€₽]\s?\d|\d\s?(?:USD|EUR)/);
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

  test('JSON-LD: the Person makes one Offer per offer, each a Service he provides, with no price', () => {
    for (const l of ['en', 'ru'] as const) {
      const person = graphOf(html[l]).find((n) => n['@type'] === 'Person');
      expect(person?.['@id']).toBe('https://rossev.dev/#person');
      const offers = person.makesOffer ?? [];
      expect(offers.length).toBe(OFFERS.length);
      offers.forEach((o: any, i: number) => {
        expect(o['@type']).toBe('Offer');
        expect(o.price).toBeUndefined();
        expect(o.priceSpecification).toBeUndefined();
        expect(o.itemOffered['@type']).toBe('Service');
        expect(o.itemOffered.name).toBe(OFFERS[i].name[l]);
        expect(o.itemOffered.provider).toEqual({ '@id': 'https://rossev.dev/#person' });
        expect(o.url).toBe(`https://rossev.dev${l === 'en' ? '' : '/ru'}/hire/#${OFFERS[i].id}`);
      });
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
  });
});
