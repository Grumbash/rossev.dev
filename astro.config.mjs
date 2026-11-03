import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rossev.dev',
  build: {
    inlineStylesheets: 'always'
  },
  devToolbar: {
    enabled: false
  }
});
