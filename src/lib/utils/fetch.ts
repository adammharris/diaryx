/**
 * Unified Fetch Utility
 * 
 * Provides a cross-platform fetch implementation that works seamlessly
 * in both Tauri desktop applications and web browsers.
 * 
 * @description This utility automatically detects the runtime environment and uses:
 * - Tauri's HTTP plugin (@tauri-apps/plugin-http) in desktop applications
 * - Standard browser fetch API in web environments
 * 
 * The implementation uses lazy loading to avoid importing Tauri dependencies
 * in web builds, ensuring optimal bundle size and compatibility.
 * 
 * @example
 * ```typescript
 * import { fetch } from '$lib/utils/fetch';
 * 
 * // Works the same in both Tauri and web environments
 * const response = await fetch('/api/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ key: 'value' })
 * });
 * 
 * const data = await response.json();
 * ```
 */
import { detectTauri } from './tauri.js';

let tauriFetch: typeof fetch | null = null;

/**
 * Lazy load Tauri fetch implementation
 * 
 * Dynamically imports the Tauri HTTP plugin only when running in a Tauri environment.
 * This prevents bundling Tauri dependencies in web builds and provides fallback
 * to browser fetch if the plugin fails to load.
 * 
 * @private
 * @returns {Promise<typeof fetch>} Tauri HTTP fetch function or browser fetch fallback
 */
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

/**
 * Unified fetch function
 * 
 * Drop-in replacement for the standard fetch API that automatically
 * adapts to the runtime environment (Tauri vs web browser).
 * 
 * @param {RequestInfo | URL} input - The resource URL or Request object
 * @param {RequestInit} init - Optional request configuration
 * @returns {Promise<Response>} Promise that resolves to the Response object
 * 
 * @example
 * ```typescript
 * // GET request
 * const response = await fetch('/api/users');
 * const users = await response.json();
 * 
 * // POST request with auth headers
 * const response = await fetch('/api/entries', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'Authorization': 'Bearer token123'
 *   },
 *   body: JSON.stringify({ title: 'My Entry' })
 * });
 * 
 * // File upload
 * const formData = new FormData();
 * formData.append('file', file);
 * const response = await fetch('/api/upload', {
 *   method: 'POST',
 *   body: formData
 * });
 * ```
 */
export const fetch: typeof globalThis.fetch = async (input, init) => {
  if (detectTauri()) {
    const tauriHttpFetch = await getTauriFetch();
    return tauriHttpFetch(input, init);
  } else {
    // Use regular browser fetch
    return globalThis.fetch(input, init);
  }
};