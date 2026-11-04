// /c is where the QR code on the phone case lands: someone scans it in person, often on mobile data,
// and wants to book a call or keep the contact. So it is a card, not a page of the site: no web fonts,
// no site CSS or JS, a few kilobytes, one booking link tagged `case`, a vCard and the main contacts.
// The code spells the URL in capitals (HTTPS://ROSSEV.DEV/C fits the smallest QR version), so /C must
// serve the card too, without a redirect round trip.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PROFILE } from '../src/data/profile';
import { PLACEMENTS } from '../src/scripts/analytics';

setDefaultTimeout(120_000);

const PAGES = { en: 'dist/c/index.html', ru: 'dist/ru/c/index.html' } as const;
const VCF = 'dist/gleb-rosev.vcf';
const html: Record<string, string> = {};

beforeAll(() => {
  execSync('bun run build', { stdio: 'ignore' });
  for (const [l, f] of Object.entries(PAGES)) html[l] = existsSync(f) ? readFileSync(f, 'utf8') : '';
});

const hrefs = (page: string) => [...page.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

describe('/c card', () => {
  test('is built in both languages and links the other one', () => {
    for (const l of ['en', 'ru'] as const) {
      expect(html[l], PAGES[l]).not.toBe('');
      expect(html[l]).toContain(`<html lang="${l}"`);
    }
    expect(hrefs(html.en)).toContain('/ru/c/');
    expect(hrefs(html.ru)).toContain('/c/');
  });

  test('is a few kilobytes with no web fonts, site stylesheet or site scripts', () => {
    for (const l of ['en', 'ru'] as const) {
      const page = html[l];
      expect(gzipSync(page).length, `${l} gzip`).toBeLessThan(3000);
      expect(page).not.toMatch(/\.woff2|@font-face|rel="preload"/);
      expect(page).not.toMatch(/<link[^>]+rel="stylesheet"/);
      expect(page).not.toMatch(/<script[^>]+type="module"/);
      expect(page).not.toContain('/_astro/');
      // Only the analytics tracker may load a script; nothing inline that would need a CSP hash.
      for (const [tag] of page.matchAll(/<script\b[^>]*>/g)) expect(tag).toContain('https://cloud.umami.is/script.js');
    }
  });

  test('one booking link, tagged with the case placement', () => {
    expect(PLACEMENTS as readonly string[]).toContain('case');
    for (const l of ['en', 'ru'] as const) {
      const cal = hrefs(html[l]).filter((h) => h.startsWith('https://cal.com'));
      expect(cal.length).toBe(1);
      expect(new URL(cal[0]).searchParams.get('utm_content')).toBe('case');
    }
  });

  test('links the vCard, email, phone, LinkedIn and the hire page', () => {
    const tel = `tel:${PROFILE.phone.replace(/\s/g, '')}`;
    for (const l of ['en', 'ru'] as const) {
      const links = hrefs(html[l]);
      expect(links).toContain('/gleb-rosev.vcf');
      expect(links).toContain(`mailto:${PROFILE.email}`);
      expect(links).toContain(tel);
      expect(links).toContain(PROFILE.linkedin);
      expect(links).toContain(l === 'en' ? '/hire/' : '/ru/hire/');
    }
  });

  test('stays out of search: noindex and not in the sitemap', () => {
    for (const l of ['en', 'ru'] as const) expect(html[l]).toMatch(/<meta name="robots" content="noindex/);
    const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
    expect(xml).not.toMatch(/rossev\.dev(\/ru)?\/c\//);
  });
});

describe('vCard', () => {
  test('has the name, phone, email and site from the profile', () => {
    expect(existsSync(VCF)).toBe(true);
    const card = readFileSync(VCF, 'utf8');
    expect(card.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(card.trimEnd().endsWith('END:VCARD')).toBe(true);
    expect(card).toContain(`FN:${PROFILE.name.en}\r\n`);
    expect(card).toContain(`TEL;TYPE=CELL:${PROFILE.phone.replace(/\s/g, '')}\r\n`);
    expect(card).toContain(`EMAIL;TYPE=INTERNET:${PROFILE.email}\r\n`);
    expect(card).toContain('URL:https://rossev.dev/\r\n');
  });

  test('is served as text/vcard so phones offer to add the contact', () => {
    const rule = vercel.headers.find((h: any) => h.source.includes('vcf'));
    const type = rule?.headers.find((h: any) => h.key === 'Content-Type')?.value ?? '';
    expect(type).toMatch(/^text\/vcard/);
  });
});

describe('capital /C from the QR code', () => {
  test('is rewritten to the card, not redirected', () => {
    const rewrites = vercel.rewrites ?? [];
    for (const src of ['/C', '/C/']) expect(rewrites).toContainEqual({ source: src, destination: '/c/' });
    for (const r of vercel.redirects) expect(r.source).not.toMatch(/^\/C\/?$/);
  });
});
