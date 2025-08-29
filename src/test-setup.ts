// Global test setup for Vitest
import '@testing-library/jest-dom';

// Basic fetch polyfill if needed (jsdom has fetch in newer versions, but guard)
if (!(globalThis as any).fetch) {
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({}) });
}

// Stub Tauri detection helper if modules import it
(globalThis as any).__TAURI__ = (globalThis as any).__TAURI__ || {};
