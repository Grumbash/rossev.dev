// Headless Chrome against the built site: dist/ served by Bun, the page under test in an iframe,
// a probe script injected into the page loaded with ?probe=<mode>. The probe appends
// <pre id="__probe">JSON</pre>; the frame copies it out for --dump-dom. Pages the probe page
// fetches or navigates to are served untouched, unless they too carry ?probe=.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'bun:test';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const hasChrome = () => existsSync(CHROME);

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
    async run(path: string, mode: string) {
      const proc = Bun.spawn(
        [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--window-size=1320,1000', '--virtual-time-budget=30000', '--dump-dom', `http://localhost:${server.port}/frame?path=${encodeURIComponent(path)}&mode=${mode}`],
        { stdout: 'pipe', stderr: 'ignore' },
      );
      const dom = await new Response(proc.stdout).text();
      await proc.exited;
      const json = dom.match(/<pre id="__result">([\s\S]*?)<\/pre>/)?.[1];
      expect(json).toBeDefined();
      return JSON.parse(json!.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    },
  };
}
