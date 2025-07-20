// Hybrid adapter configuration for both Tauri and Vercel deployment
import adapterStatic from "@sveltejs/adapter-static";
import adapterVercel from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Use Vercel adapter when deploying to Vercel, static adapter for Tauri
const isVercelBuild = process.env.VERCEL || process.env.NODE_ENV === 'production';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: isVercelBuild 
      ? adapterVercel({
          // Vercel adapter configuration
          runtime: 'nodejs18.x'
        })
      : adapterStatic({
          // Tauri static adapter configuration
          fallback: 'index.html',
          pages: 'build',
          assets: 'build',
          strict: false
        }),
  },
};

export default config;
