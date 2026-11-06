import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// /routes.json: every page the build emitted, for the 404's "did you mean". Read from dist itself,
// so it can't drift from the pages; fragments, /booked and the /c card are nobody's typo target.
const routesJson = {
  name: 'routes-json',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const root = fileURLToPath(dir);
      const routes = [];
      const walk = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name === 'index.html') routes.push(`/${p.slice(root.length, -'index.html'.length)}`.replace(/^\/+/, '/'));
        }
      };
      walk(root);
      const keep = routes.filter((r) => !/\/partials\/|^(\/ru)?\/(booked|c|offline)\/$/.test(r)).sort();
      writeFileSync(join(root, 'routes.json'), JSON.stringify(keep));
    }
  }
};

// /sw.js: the service worker (src/sw/sw.ts with src/sw/policy.ts), built once the pages exist. PRECACHE is the shell a
// first visit keeps: home, /writing/ and the offline page in both languages, plus every script and
// preloaded font those pages load. VERSION hashes the list and the bundle, so a new build installs.
const SHELL = ['/', '/ru/', '/writing/', '/ru/writing/', '/offline/', '/ru/offline/'];
const serviceWorker = {
  name: 'service-worker',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const root = fileURLToPath(dir);
      const refs = new Set(['/favicon.svg']);
      for (const page of SHELL) {
        const html = readFileSync(join(root, page, 'index.html'), 'utf8');
        for (const m of html.matchAll(/(?:src|href)="(\/(?!_vercel\/)[^"?#]+\.(?:js|woff2))"/g)) refs.add(m[1]);
      }
      const precache = [...SHELL, ...[...refs].sort()];
      // Types stripped by TypeScript (a devDependency; no bundler to rely on): the policy's exports and
      // the worker's import of them become one classic script in one function scope.
      const strip = (file) => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
      const policy = strip('src/sw/policy.ts').replace(/^export /gm, '');
      const worker = strip('src/sw/sw.ts').replace(/^import .*$/gm, '');
      const code = `(() => {\n${policy}\n${worker}\n})();\n`;
      const version = createHash('sha256').update(JSON.stringify(precache)).update(code).digest('hex').slice(0, 12);
      writeFileSync(join(root, 'sw.js'), `const PRECACHE = ${JSON.stringify(precache)};\nconst VERSION = "${version}";\n${code}`);
    }
  }
};

export default defineConfig({
  site: 'https://rossev.dev',
  // Pages build to <route>/index.html, so post pages live at /writing/<slug>/ (the canonical form).
  build: {
    format: 'directory',
    inlineStylesheets: 'always'
  },
  // Astro 7's default ('jsx') drops the whitespace between elements, which glues inline links and
  // spans together; true is the lossless compression Astro 5 shipped with.
  compressHTML: true,
  // HTMX fragments are not pages: they stay out of the sitemap (and carry noindex, see vercel.json).
  // Neither is /booked (or /ru/booked), cal.com's after-booking redirect (noindex in its <head>),
  // nor /c, the card behind the QR code on the phone case, nor /offline, the service worker's page
  // for a page not stored yet (both noindex too).
  // Every page exists per locale (src/i18n): EN at /, RU under /ru/; the sitemap links them as alternates.
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/partials/') && !/^(\/ru)?\/(booked|c|offline)\/?$/.test(new URL(page).pathname),
      i18n: { defaultLocale: 'en', locales: { en: 'en', ru: 'ru' } }
    }),
    routesJson,
    serviceWorker
  ],
  // A small <script> would otherwise be inlined, and every inline script needs its own CSP hash in
  // vercel.json. Page scripts stay files under /_astro/ ('self'); fonts and images keep the default.
  vite: {
    build: {
      assetsInlineLimit: (file) => (/\.(js|ts)$/.test(file) ? false : undefined)
    }
  },
  devToolbar: {
    enabled: false
  }
});
