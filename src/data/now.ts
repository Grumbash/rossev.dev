// The site's last commit for the "Gleb now" footer line (scripts/now.ts), read from git at build. A
// build without the history (a bare tarball) falls back to what Vercel tells it, dated now.
import { execSync } from 'node:child_process';

export type Commit = { sha: string; subject: string; date: string };

export const REPO = 'Grumbash/rossev.dev';
export const commitUrl = (sha: string) => `https://github.com/${REPO}/commit/${sha}`;

let cached: Commit | undefined;

export function lastCommit(): Commit {
  if (cached) return cached;
  try {
    const [sha, subject, date] = execSync('git log -1 --format=%H%x00%s%x00%cI', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\0');
    cached = { sha, subject, date };
  } catch {
    const env = process.env;
    cached = { sha: env.VERCEL_GIT_COMMIT_SHA ?? 'main', subject: (env.VERCEL_GIT_COMMIT_MESSAGE ?? '').split('\n')[0], date: new Date().toISOString() };
  }
  return cached;
}
