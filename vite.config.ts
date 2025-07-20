import { defineConfig, type UserConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

// Start with the base configuration that applies to both environments
const config: UserConfig = {
  plugins: [sveltekit()],
  // Add this server configuration to the base config
  server: {
    watch: {
      // These are the folders to ignore.
      ignored: [
        "**/node_modules/**",
        "**/.svelte-kit/**",
        "**/src-tauri/target/**", // Crucial for Tauri projects
      ],
    },
  },
};

// If the environment is NOT Vercel, add the Tauri-specific server options.
// Note: This will overwrite the `server` config above, which is fine
// because the Tauri dev environment is different.
if (!process.env.VERCEL) {
  // @ts-expect-error process is a nodejs global
  const host = process.env.TAURI_DEV_HOST;

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
    // We also add the ignored paths here for consistency when running `tauri dev`
    watch: {
      ignored: [
        "**/node_modules/**",
        "**/.svelte-kit/**",
        "**/src-tauri/target/**",
      ],
    },
  };
}

// Export the final configuration object directly
export default defineConfig(config);