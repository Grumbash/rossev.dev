// Headless Chrome against the built site: dist/ served by Bun, the page under test in an iframe,
// a probe script injected into the page loaded with ?probe=<mode>. The probe appends
// <pre id="__probe">JSON</pre>; the frame copies it out for --dump-dom. Pages the probe page
// fetches or navigates to are served untouched, unless they too carry ?probe=.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'bun:test';
import { findChrome } from '../../scripts/chrome';

/**
 * Switches every test Chrome gets, as automation tools pass them: no GPU, no first-run or
 * background work (component updates, extensions, throttled background timers and renderers),
 * and no OS keychain or password store, which a second Chrome running alongside could hold up.
 */
export const AUTOMATION_FLAGS = [
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-component-update',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--use-mock-keychain',
  '--password-store=basic',
];

/** The Chrome binary, or '' when there is none (browser tests then skip). */
export const CHROME = findChrome() ?? '';
// Locally the browser tests skip without Chrome; in CI that would pass with nothing checked.
export const hasChrome = () => {
  if (!CHROME && process.env.CI) throw new Error('No Chrome found in CI: set CHROME_PATH or install google-chrome');
  return CHROME !== '';
};

const FRAME = (path: string, mode: string) => `<!doctype html><body style="margin:0">
  <iframe src="${path}${path.includes('?') ? '&' : '?'}probe=${mode}" width="1280" height="900" style="border:0;display:block"></iframe>
  <script>const t=setInterval(()=>{const p=document.querySelector('iframe').contentDocument?.getElementById('__probe');
    if(p){clearInterval(t);const o=document.createElement('pre');o.id='__result';o.textContent=p.textContent;document.body.appendChild(o);}},100);</script>`;

/** A server for `probe(mode)` scripts; call stop() in afterAll. */
export function probeServer(probe: (mode: string) => string) {
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/frame') return new Response(FRAME(url.searchParams.get('path')!, url.searchParams.get('mode')!), { headers: { 'content-type': 'text/html' } });
      let path = url.pathname;
      // No GR companion for probes: a post page that creates the companion's dedicated worker, then
      // navigates or reloads, can keep --virtual-time-budget from ever running out (bisected: only
      // creating the worker matters, with or without its script or model). Probes test the rest of
      // the page; the companion has its own tests in real Chrome (tests/companion.test.ts).
      if (path === '/nca/gr.bin' || /^\/_astro\/companion\./.test(path)) return new Response('', { status: 404 });
      if (path.endsWith('/')) path += 'index.html';
      const file = Bun.file(join('dist', path));
      if (!(await file.exists())) return new Response('', { status: 404 });
      const mode = url.searchParams.get('probe');
      if (mode && path.endsWith('.html')) return new Response((await file.text()).replace('</body>', `${probe(mode)}</body>`), { headers: { 'content-type': 'text/html' } });
      return new Response(file);
    },
  });
  return {
    stop: () => server.stop(true),
    /** `flags`: extra Chrome switches, e.g. --force-dark-mode or --force-prefers-reduced-motion. */
    async run(path: string, mode: string, flags: string[] = []) {
      // Its own profile, like tests/fixtures/cdp.ts: Chromes running side by side must not share one.
      const profile = mkdtempSync(join(tmpdir(), 'probe-'));
      const proc = Bun.spawn(
        [CHROME, '--headless=new', ...AUTOMATION_FLAGS, `--user-data-dir=${profile}`, '--window-size=1320,1000', '--virtual-time-budget=30000', ...flags, '--dump-dom', `http://localhost:${server.port}/frame?path=${encodeURIComponent(path)}&mode=${mode}`],
        // A Chrome that never finishes its virtual-time budget is killed, so the test fails with a reason.
        { stdout: 'pipe', stderr: 'ignore', timeout: 45_000 },
      );
      const dom = await new Response(proc.stdout).text();
      await proc.exited;
      rmSync(profile, { recursive: true, force: true });
      const json = dom.match(/<pre id="__result">([\s\S]*?)<\/pre>/)?.[1];
      // No result: say what Chrome gave back instead of a bare "undefined".
      expect(json, `no probe result for ${path} (${mode}); Chrome exited ${proc.exitCode} after dumping ${dom.length} chars: ${dom.slice(0, 300)}`).toBeDefined();
      return JSON.parse(json!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    },
  };
}
