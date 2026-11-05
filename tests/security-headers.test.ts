// Security headers come from vercel.json, so a static build can be checked without Vercel. The CSP
// is strict on scripts: no 'unsafe-inline', no 'unsafe-eval', no blob: or data:. Every inline
// script the build emits is allowed by its sha256 hash, so a new or changed one fails here until
// its hash is in vercel.json; markup carries no inline event handlers (data-action instead).
import { beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIONS, initActions } from '../src/scripts/actions';
import { buildSite } from './fixtures/build';

type Rule = { source: string; headers: { key: string; value: string }[] };
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers?: Rule[] };
const global = (vercel.headers ?? []).find((r) => r.source === '/(.*)');
const header = (key: string) => global?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? '';
const csp = () =>
  Object.fromEntries(
    header('Content-Security-Policy')
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...values]) => [name, values]),
  ) as Record<string, string[]>;

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

describe('vercel.json sends the security headers on every path', () => {
  test('one rule for every path', () => {
    expect(global).toBeDefined();
  });

  test('HSTS covers subdomains for two years', () => {
    expect(header('Strict-Transport-Security')).toMatch(/max-age=63072000/);
    expect(header('Strict-Transport-Security')).toMatch(/includeSubDomains/);
  });

  test('no MIME sniffing, no framing, an own browsing context group', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  // strict-origin: same-origin requests get the origin only, so the PII cal.com puts in the
  // /booked/ query never rides along in a Referer, not even to rossev.dev's own fonts.
  test('Referer carries the origin only, never a path or query', () => {
    expect(header('Referrer-Policy')).toBe('strict-origin');
  });

  test('the microphone is for this origin only (the VAD demo); camera, location and payment for nobody', () => {
    const pp = header('Permissions-Policy');
    expect(pp).toMatch(/(^|, )microphone=\(self\)/);
    for (const f of ['camera', 'geolocation', 'payment', 'usb']) expect(pp).toMatch(new RegExp(`(^|, )${f}=\\(\\)`));
  });

  test('a strict CSP: own origin by default, no plugins, no base or form hijack, no framing', () => {
    const p = csp();
    expect(p['default-src']).toEqual(["'self'"]);
    expect(p['object-src']).toEqual(["'none'"]);
    expect(p['base-uri']).toEqual(["'none'"]);
    expect(p['form-action']).toEqual(["'self'"]);
    expect(p['frame-ancestors']).toEqual(["'none'"]);
    expect(p['worker-src']).toEqual(["'self'"]);
  });

  test('scripts: own origin, Umami Cloud and hashes; never inline, eval, blob: or data:', () => {
    const s = csp()['script-src'] ?? [];
    expect(s).toContain("'self'");
    expect(s).toContain('https://cloud.umami.is');
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", 'blob:', 'data:', '*', 'https:']) expect(s).not.toContain(bad);
    for (const v of s) expect(v).toMatch(/^('self'|https:\/\/cloud\.umami\.is|'sha256-[A-Za-z0-9+/]+=*')$/);
  });

  test('Umami Cloud may send its events; nothing else leaves the origin', () => {
    expect(csp()['connect-src']).toEqual(["'self'", 'https://gateway.umami.is']);
  });
});

describe('the built site runs under that CSP', () => {
  let files: string[] = [];
  beforeAll(() => {
    buildSite();
    files = htmlFiles('dist');
  });

  test('pages and partials are built', () => {
    expect(files.some((f) => f.endsWith('dist/index.html'))).toBe(true);
    expect(files.some((f) => f.includes('/partials/'))).toBe(true);
  });

  test('no inline event handlers and no javascript: URLs anywhere', () => {
    for (const f of files) {
      const html = readFileSync(f, 'utf8');
      const tags = html.match(/<[a-zA-Z][^>]*>/g) ?? [];
      const handlers = tags.filter((t) => /\son[a-z]+\s*=/i.test(t));
      expect(handlers, f).toEqual([]);
      expect(html, f).not.toMatch(/(href|src|action)\s*=\s*["']?\s*javascript:/i);
    }
  });

  test('every inline script has its hash in script-src', () => {
    const allowed = new Set(csp()['script-src'] ?? []);
    const missing = new Set<string>();
    let inline = 0;
    for (const f of files) {
      for (const [, attrs, body] of readFileSync(f, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/\bsrc=/.test(attrs) || /application\/ld\+json/.test(attrs)) continue;
        inline++;
        if (!allowed.has(sha(body))) missing.add(`${sha(body)} (${f}: ${body.trim().slice(0, 50)})`);
      }
    }
    expect(inline).toBeGreaterThan(0);
    expect([...missing]).toEqual([]);
  });

  test('every hash in script-src belongs to a script the build still emits', () => {
    const emitted = new Set<string>();
    for (const f of files)
      for (const [, attrs, body] of readFileSync(f, 'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
        if (!/\bsrc=/.test(attrs)) emitted.add(sha(body));
    for (const h of (csp()['script-src'] ?? []).filter((v) => v.startsWith("'sha256-"))) expect(emitted.has(h), h).toBe(true);
  });

  test('every script file comes from this origin or Umami Cloud', () => {
    for (const f of files)
      for (const [, src] of readFileSync(f, 'utf8').matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g))
        expect(src, f).toMatch(/^(\/(?!\/)|https:\/\/cloud\.umami\.is\/)/);
  });

  test('every data-action names a dispatched action, with an argument it accepts', () => {
    const args: Record<string, (string | undefined)[]> = {
      setIsoDomain: ['yagni', 'voice', 'saas'],
      setIsoStratum: ['all', '1', '0', '-1'],
      stepIsoNode: ['1', '-1'],
      triggerIsoFault: [undefined, 'keep-focus'],
    };
    let seen = 0;
    for (const f of files)
      for (const [tag] of readFileSync(f, 'utf8').matchAll(/<[a-z][^>]*\sdata-action="[^"]*"[^>]*>/g)) {
        seen++;
        const name = tag.match(/data-action="([^"]*)"/)![1];
        const arg = tag.match(/data-arg="([^"]*)"/)?.[1];
        expect(Object.keys(ACTIONS), `${f}: ${tag}`).toContain(name);
        expect(args[name] ?? [undefined], `${f}: ${tag}`).toContain(arg);
        if (name === 'copy') expect(tag, f).toMatch(/data-copy="[^"]+"/);
      }
    expect(seen).toBeGreaterThan(20);
  });

  test('the VAD tap worklet is a file on this origin, not a blob: URL', () => {
    const demo = readFileSync('src/scripts/vad/demo.ts', 'utf8');
    expect(demo).not.toContain('createObjectURL');
    expect(demo).toContain("addModule('/vad/tap-worklet.js')");
    expect(statSync('dist/vad/tap-worklet.js').isFile()).toBe(true);
  });
});

describe('the data-action dispatcher', () => {
  const setup = () => {
    let listener: ((e: any) => void) | undefined;
    const doc = { addEventListener: (_t: string, fn: (e: any) => void) => (listener = fn) } as unknown as Document;
    initActions(doc);
    const click = (dataset: Record<string, string>) => {
      const el = { dataset } as any;
      listener!({ target: { closest: (sel: string) => (sel === '[data-action]' ? el : null) } });
      return el;
    };
    return { click };
  };

  test('calls the named action with its argument and the element', () => {
    const calls: unknown[][] = [];
    (globalThis as any).window = { setIsoStratum: (...a: unknown[]) => calls.push(['stratum', ...a]), stepIsoNode: (d: number) => calls.push(['step', d]) };
    const { click } = setup();
    const el = click({ action: 'setIsoStratum', arg: '-1' });
    click({ action: 'stepIsoNode', arg: '-1' });
    expect(calls).toEqual([['stratum', -1, el], ['step', -1]]);
  });

  test('ignores names it does not list and arguments it does not accept', () => {
    const calls: unknown[] = [];
    (globalThis as any).window = { setIsoStratum: () => calls.push(1), eval: () => calls.push('eval') };
    const { click } = setup();
    click({ action: 'eval', arg: 'alert(1)' });
    click({ action: 'constructor' });
    click({ action: 'setIsoStratum', arg: '2' });
    expect(calls).toEqual([]);
  });
});
