// Real Chrome over the DevTools protocol, for what --dump-dom with virtual time cannot do: a real
// mouse (hover, press), and frames that are actually rendered (a view transition's `ready` waits
// for one). dist/ is served by Bun; Chrome gets a fresh profile and a free debugging port.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AUTOMATION_FLAGS, CHROME } from './probe';

export type Cdp = {
  origin: string;
  /** Take the site down: the network is gone, as far as the page can tell. */
  stopServer: () => void;
  send: (method: string, params?: object) => Promise<any>;
  evaluate: (expression: string) => Promise<any>;
  /** Protocol events, as they arrive. */
  on: (handler: (method: string, params: any) => void) => void;
};

export type ChromeOptions = {
  /** Milliseconds to hold back the response for a path: a loaded runner, made reproducible. */
  delay?: (path: string) => number;
};

export async function withChrome<T>(run: (cdp: Cdp) => Promise<T>, { delay }: ChromeOptions = {}): Promise<T> {
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      let p = new URL(req.url).pathname;
      const ms = delay?.(p) ?? 0;
      if (ms > 0) await Bun.sleep(ms);
      if (p.endsWith('/')) p += 'index.html';
      const f = Bun.file(join('dist', p));
      return (await f.exists()) ? new Response(f) : new Response('', { status: 404 });
    },
  });
  const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
  const chrome = Bun.spawn([CHROME, '--headless=new', ...AUTOMATION_FLAGS, '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' });
  let ws: WebSocket | undefined;
  try {
    // With port 0 Chrome picks a free port and writes it to DevToolsActivePort.
    let port = '';
    for (let i = 0; i < 100 && !port; i++) {
      await Bun.sleep(100);
      port = existsSync(join(profile, 'DevToolsActivePort')) ? readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] : '';
    }
    const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t: { type: string }) => t.type === 'page');
    const socket = (ws = new WebSocket(page.webSocketDebuggerUrl));
    await new Promise((r) => (socket.onopen = r));
    let id = 0;
    const pending = new Map<number, (v: any) => void>();
    const handlers: ((method: string, params: any) => void)[] = [];
    socket.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.method) for (const h of handlers) h(d.method, d.params);
      if (d.id && pending.has(d.id)) pending.get(d.id)!(d.result ?? d.error), pending.delete(d.id);
    };
    const send = (method: string, params: object = {}) => new Promise<any>((r) => (pending.set(++id, r), socket.send(JSON.stringify({ id, method, params }))));
    // A script that throws fails the test with its own message; by value, an Error would come back as {}.
    const evaluate = async (expression: string) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`in the page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result?.value;
    };
    return await run({ origin: `http://localhost:${server.port}`, stopServer: () => server.stop(true), send, evaluate, on: (h) => handlers.push(h) });
  } finally {
    ws?.close();
    chrome.kill();
    server.stop(true);
    rmSync(profile, { recursive: true, force: true });
  }
}
