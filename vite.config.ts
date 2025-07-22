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
    }
  },
};

// Export the final configuration object directly
export default defineConfig(config);