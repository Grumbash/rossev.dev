// Tells IndexNow (Bing, Yandex, Seznam, Naver) about every URL in the live sitemap, so a deploy
// is crawled within hours instead of whenever the crawler next comes by. Bing's index is what
// ChatGPT search reads. The key is public by design: IndexNow checks that
// https://rossev.dev/<key>.txt serves it, which proves we own the host.
//
// Usage: bun scripts/indexnow.ts  (CI runs it after each production deploy; see indexnow.yml).
// Env: SITE overrides the origin (default https://rossev.dev).

export const KEY = '3c59b4131caaac0708641ff3ca28d5e6';

export function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

async function text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const site = (process.env.SITE ?? 'https://rossev.dev').replace(/\/$/, '');
  const host = new URL(site).host;

  // The key file must be live before IndexNow is pinged, or the ping is rejected with 403.
  const served = (await text(`${site}/${KEY}.txt`)).trim();
  if (served !== KEY) throw new Error(`${site}/${KEY}.txt does not serve the key`);

  const sitemaps = locs(await text(`${site}/sitemap-index.xml`));
  const urls = (await Promise.all(sitemaps.map(async (s) => locs(await text(s))))).flat();
  if (urls.length === 0) throw new Error('the sitemap lists no URLs');

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: KEY, keyLocation: `${site}/${KEY}.txt`, urlList: urls }),
  });
  // 200 and 202 both mean accepted; 202 is "key validation pending" on a first ping.
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow: HTTP ${res.status} ${await res.text()}`);
  }
  console.log(`IndexNow: ${urls.length} URLs submitted for ${host} (HTTP ${res.status})`);
}

if (import.meta.main) await main();
