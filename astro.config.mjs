import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, writeFileSync } from 'node:fs';
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
      const keep = routes.filter((r) => !/\/partials\/|^(\/ru)?\/(booked|c)\/$/.test(r)).sort();
      writeFileSync(join(root, 'routes.json'), JSON.stringify(keep));
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
  // nor /c, the card behind the QR code on the phone case (noindex too).
  // Every page exists per locale (src/i18n): EN at /, RU under /ru/; the sitemap links them as alternates.
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/partials/') && !/^(\/ru)?\/(booked|c)\/?$/.test(new URL(page).pathname),
      i18n: { defaultLocale: 'en', locales: { en: 'en', ru: 'ru' } }
    }),
    routesJson
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
