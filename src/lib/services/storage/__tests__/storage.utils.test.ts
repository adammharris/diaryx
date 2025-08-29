import { describe, it, expect } from 'vitest';
import { titleToSafeFilename, generateUniqueFilename, createTitleFromId, hasCorrectExtension, STORAGE_CONFIG } from '../utils/storage.utils';

describe('storage.utils', () => {
  it('titleToSafeFilename sanitizes & normalizes', () => {
    expect(titleToSafeFilename('Hello  World!! ** DiaryX')).toBe('hello-world-diaryx');
  });

  it('generateUniqueFilename increments when collision', async () => {
    const existing = new Set(['hello']);
    const fn = async (f:string)=> existing.has(f);
    const unique = await generateUniqueFilename('Hello', fn);
    expect(unique).toBe('hello-1');
  });

  it('createTitleFromId converts separators to spaced title case', () => {
    expect(createTitleFromId('my-entry_name')).toBe('My Entry Name');
  });

  it('hasCorrectExtension validates extension', () => {
    expect(hasCorrectExtension('file'+STORAGE_CONFIG.fileExtension)).toBe(true);
    expect(hasCorrectExtension('file.txt')).toBe(false);
  });
});
