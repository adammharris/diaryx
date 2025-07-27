// Hybrid adapter configuration for Tauri, Vercel, and Cloudflare Pages deployment
import adapterStatic from "@sveltejs/adapter-static";
import adapterVercel from "@sveltejs/adapter-vercel";
import adapterCloudflare from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Determine which adapter to use based on environment
const isVercelBuild = process.env.VERCEL;
const isCloudflareBuild = process.env.CF_PAGES;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: isVercelBuild 
      ? adapterVercel({
          // Vercel adapter configuration - use default runtime
        })
      : isCloudflareBuild
      ? adapterCloudflare({
          // Cloudflare Pages adapter configuration
          routes: {
            include: ["/*"],
            exclude: ["<build>", "<files>", "<prerendered>"]
          }
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
