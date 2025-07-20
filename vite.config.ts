import { defineConfig, type UserConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

// Start with the base configuration that applies to both environments
const config: UserConfig = {
  plugins: [sveltekit()],
};

// If the environment is NOT Vercel, add the Tauri-specific server options.
if (!process.env.VERCEL) {
  // @ts-expect-error process is a nodejs global
  const host = process.env.TAURI_DEV_HOST;

  config.clearScreen = false;
  config.server = {
    fs: {
      allow: ["static"],
    },
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  };
}

// Export the final configuration object directly
export default defineConfig(config);