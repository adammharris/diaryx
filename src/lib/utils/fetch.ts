/**
 * Unified fetch utility that works in both Tauri and web environments
 * Uses Tauri's HTTP plugin in Tauri, regular fetch in browser
 */
import { detectTauri } from './tauri.js';

let tauriFetch: typeof fetch | null = null;

// Lazy load Tauri fetch only when needed
async function getTauriFetch() {
  if (!tauriFetch) {
    try {
      const module = await import('@tauri-apps/plugin-http');
      tauriFetch = module.fetch;
    } catch (error) {
      console.warn('Failed to load Tauri HTTP plugin, falling back to browser fetch');
      tauriFetch = globalThis.fetch;
    }
  }
  return tauriFetch;
}

export const fetch: typeof globalThis.fetch = async (input, init) => {
  if (detectTauri()) {
    const tauriHttpFetch = await getTauriFetch();
    return tauriHttpFetch(input, init);
  } else {
    // Use regular browser fetch
    return globalThis.fetch(input, init);
  }
};