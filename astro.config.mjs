import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://rossev.dev',
  // Pages build to <route>/index.html, so post pages live at /writing/<slug>/ (the canonical form).
  build: {
    format: 'directory',
    inlineStylesheets: 'always'
  },
  // HTMX fragments are not pages: they stay out of the sitemap (and carry noindex, see vercel.json).
  // Neither is /booked (or /ru/booked), cal.com's after-booking redirect (noindex in its <head>).
  // Every page exists per locale (src/i18n): EN at /, RU under /ru/; the sitemap links them as alternates.
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/partials/') && !/^(\/ru)?\/booked\/?$/.test(new URL(page).pathname),
      i18n: { defaultLocale: 'en', locales: { en: 'en', ru: 'ru' } }
    })
  ],
  devToolbar: {
    enabled: false
  }
});
