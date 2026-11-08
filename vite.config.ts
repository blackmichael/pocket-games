import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter(), prerender: { entries: ['/', '/games/fivefold/', '/games/kings/'] } })],
  server: { allowedHosts: ['testlab.walleye-koi.ts.net'] },
  preview: { allowedHosts: ['testlab.walleye-koi.ts.net'] },
  test: { include: ['src/**/*.test.ts'] }
});
