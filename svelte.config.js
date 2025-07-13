// Tauri doesn't have a Node.js server to do proper SSR
// so we will use adapter-static to prerender the app (SSG)
// Configure as SPA with fallback to handle dynamic file system content
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // SPA mode with fallback for dynamic content
      fallback: 'index.html',
      // Precompile entry point
      pages: 'build',
      assets: 'build',
      strict: false
    }),
  },
};

export default config;
