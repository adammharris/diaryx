
// Mock implementations for testing
export const mockOpenDB = {
  openDB: () => Promise.resolve({})
};

export const mockTauriFs = {
  readTextFile: () => Promise.resolve(''),
  writeTextFile: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  exists: () => Promise.resolve(true),
  readDir: () => Promise.resolve([]),
  mkdir: () => Promise.resolve(),
  watch: () => Promise.resolve(() => {}),
  BaseDirectory: {
    Document: 'document',
  },
};
