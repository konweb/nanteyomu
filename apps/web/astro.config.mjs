import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nanteyomu.dev',
  output: 'static',
  integrations: [solid(), sitemap()],
  build: { format: 'directory' },
});
