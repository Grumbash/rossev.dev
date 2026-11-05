// One site build per `bun test` run. Every test file runs in the same process, so the files that
// read dist/ share this build instead of each rebuilding it (and wiping dist/ under the others).
// Built with the analytics id set, so pages carry the Umami tag the analytics tests look for.
// SKIP_BUILD=1 reuses an existing dist/ when only tests changed.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

let built = false;

export function buildSite() {
  if (built) return;
  if (!(process.env.SKIP_BUILD && existsSync('dist/index.html')))
    execSync('bun run build', { stdio: 'ignore', env: { ...process.env, PUBLIC_UMAMI_WEBSITE_ID: 'test-site-id' } });
  built = true;
}
