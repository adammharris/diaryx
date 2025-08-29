import { readDir } from '@tauri-apps/plugin-fs';
import { STORAGE_CONFIG } from './utils';
import { extractIdFromFilename, hasCorrectExtension } from './utils';
import type { JournalEntryMetadata } from '../../storage/types';
import type { TauriStorageProvider } from './utils';

export class TauriEntryScannerService {
  constructor(private storageProvider: () => TauriStorageProvider) {}

  async scan(): Promise<JournalEntryMetadata[]> {
    const entries = await readDir(STORAGE_CONFIG.journalFolder, { baseDir: STORAGE_CONFIG.baseDir });
    const list: JournalEntryMetadata[] = [];
    for (const entry of entries) {
      if (entry.isFile && entry.name && hasCorrectExtension(entry.name)) {
        const id = extractIdFromFilename(entry.name);
        const metadata = await this.storageProvider().getEntryMetadata(id);
        if (metadata) list.push(metadata);
      }
    }
    return list.sort((a,b)=> new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());
  }
}
