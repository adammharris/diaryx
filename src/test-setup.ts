import { vi } from 'vitest';

// Mock external dependencies with hoisted mocks
vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAllFromIndex: vi.fn().mockResolvedValue([]),
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      }),
      done: Promise.resolve()
    }),
    objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
    createObjectStore: vi.fn().mockReturnValue({
      createIndex: vi.fn()
    })
  })
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  remove: vi.fn(),
  exists: vi.fn(),
  readDir: vi.fn(),
  mkdir: vi.fn(),
  watch: vi.fn(),
  BaseDirectory: {
    Document: 'document'
  }
}));

vi.mock('../utils/tauri', () => ({
  detectTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../stores/metadata', () => ({
  metadataStore: {
    setAllEntries: vi.fn(),
    updateEntryMetadata: vi.fn()
  }
}));

// Add IndexedDB mock to global scope for jsdom
Object.defineProperty(global, 'indexedDB', {
  value: {
    open: vi.fn().mockReturnValue({
      onsuccess: null,
      onerror: null,
      result: {
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn()
        }),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false)
        },
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({ onsuccess: null }),
            put: vi.fn().mockReturnValue({ onsuccess: null }),
            delete: vi.fn().mockReturnValue({ onsuccess: null })
          }),
          oncomplete: null,
          onerror: null
        })
      }
    })
  },
  writable: true,
  configurable: true
});

// Mock crypto module for tests that don't want real encryption
vi.mock('../utils/crypto', async () => {
  const actual = await vi.importActual('../utils/crypto') as any;
  return {
    ...actual,
    encrypt: vi.fn().mockImplementation(async (content: string, password: string) => {
      return `encrypted:${content}:${password}`;
    }),
    decrypt: vi.fn().mockImplementation(async (encrypted: string, password: string) => {
      const parts = encrypted.split(':');
      if (parts[0] !== 'encrypted' || parts[2] !== password) {
        throw new Error('Invalid password');
      }
      return parts[1];
    }),
    isEncrypted: vi.fn().mockImplementation((content: string) => {
      return content.startsWith('encrypted:');
    })
  };
});