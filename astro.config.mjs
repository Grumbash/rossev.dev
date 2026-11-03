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
  integrations: [sitemap({ filter: (page) => !page.includes('/partials/') })],
  devToolbar: {
    enabled: false
  }
});
