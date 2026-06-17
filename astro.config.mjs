// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  site: 'https://quarterly.systems',
  integrations: [tailwind()],
  output: 'static',
  adapter: undefined, // Static site generation for Cloudflare Pages
});
