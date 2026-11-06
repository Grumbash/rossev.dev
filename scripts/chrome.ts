// Where Chrome lives: CHROME_PATH if set, the macOS and Windows install paths, then whatever
// google-chrome or chromium is on PATH (ubuntu-latest ships google-chrome). Lighthouse in
// perf-check.ts and every browser test use this, so CI runs them with the Chrome it already has.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export function findChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const known = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of known) if (existsSync(p)) return p;
  for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const path = execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (path) return path;
    } catch {}
  }
  return null;
}
