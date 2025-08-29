import { isBuildEnvironment, titleToSafeFilename } from './utils';
import type { StorageProvider, TauriStorageProvider } from './utils';
import { PreviewService } from '../../storage/preview.service';
import { TitleService } from '../../storage/title.service';
import type { JournalEntry, JournalEntryMetadata } from '../../storage/types';
import { metadataStore } from '../../stores/metadata';

export interface LocalEntryServiceDeps {
  environment: () => 'tauri' | 'web' | string;
  storageProvider: () => StorageProvider;
  entryCache: {
    cacheEntry(e: JournalEntry): Promise<void>;
    getCachedEntry(id: string): Promise<JournalEntry | null>;
    deleteCachedEntry(id: string): Promise<void>;
  };
  cacheSingleMetadata: (m: JournalEntryMetadata) => Promise<void>;
  updateEntryPublishStatusInMetadata?: (id: string, published: boolean) => Promise<void>;
}

export class LocalEntryService {
  constructor(private deps: LocalEntryServiceDeps) {}

  async saveEntry(id: string, content: string): Promise<boolean> {
    if (isBuildEnvironment()) return false;
    const provider = this.deps.storageProvider();
    const success = await provider.saveEntry(id, content);
    if (success && this.deps.environment() === 'tauri') {
      const cached = await this.deps.entryCache.getCachedEntry(id);
      if (cached) {
        const updated: JournalEntry = { ...cached, content, modified_at: new Date().toISOString() };
        await this.deps.entryCache.cacheEntry(updated);
        await this.updateMetadataFromEntry(updated);
      }
    }
    return success;
  }

  async createEntry(title: string): Promise<string | null> {
    if (isBuildEnvironment()) return null;
    return this.deps.storageProvider().createEntry(title);
  }

  async deleteEntryWithCloud(id: string, cloudDelete: (id: string)=> Promise<boolean>): Promise<boolean> {
    if (isBuildEnvironment()) return false;
    return cloudDelete(id);
  }

  async renameEntry(oldId: string, newTitle: string): Promise<string | null> {
    if (isBuildEnvironment()) return null;
    const env = this.deps.environment();
    const provider = this.deps.storageProvider();
    if (env === 'tauri') {
      const newId = await (provider as TauriStorageProvider).renameEntry(oldId, newTitle);
      if (newId) { await this.handleRenameCache(oldId, newId, newTitle); }
      return newId;
    } else {
      const newId = titleToSafeFilename(newTitle);
      await this.handleRenameCache(oldId, newId, newTitle);
      return newId;
    }
  }

  private async handleRenameCache(oldId: string, newId: string, newTitle: string) {
    const oldEntry = await this.deps.entryCache.getCachedEntry(oldId);
    if (!oldEntry) return;
    const updated: JournalEntry = { ...oldEntry, id: newId, title: newTitle, modified_at: new Date().toISOString() };
    await this.deps.entryCache.cacheEntry(updated);
    await this.deps.entryCache.deleteCachedEntry(oldId);
    await this.updateMetadataFromEntry(updated);
  }

  async updateDecryptedTitle(entryId: string, decryptedContent: string): Promise<void> {
    try {
      const entry = await this.deps.entryCache.getCachedEntry(entryId);
      if (!entry) return;
      const preview = PreviewService.createPreview(decryptedContent);
      // Derive a display title: we currently just reuse fallback (encrypted titles removed)
      const tempEntry: JournalEntry = { ...entry, content: decryptedContent };
      const displayTitle = TitleService.createFallbackTitle(tempEntry);
      const existingMeta = await metadataStore.getEntryMetadata(entryId);
      const updated: JournalEntryMetadata = {
        id: entry.id,
        title: displayTitle,
        created_at: entry.created_at,
        modified_at: entry.modified_at,
        file_path: entry.file_path,
        preview,
        isPublished: existingMeta?.isPublished
      } as any;
      metadataStore.updateEntryMetadata(entry.id, updated);
      await this.deps.cacheSingleMetadata(updated);
    } catch {}
  }

  async updateMetadataFromEntry(entry: JournalEntry): Promise<void> {
    const preview = PreviewService.createPreview(entry.content);
    const existingMeta = await metadataStore.getEntryMetadata(entry.id);
    const updated: JournalEntryMetadata = {
      id: entry.id,
      title: entry.title,
      created_at: entry.created_at,
      modified_at: entry.modified_at,
      file_path: entry.file_path,
      preview,
      isPublished: existingMeta?.isPublished
    } as any;
    metadataStore.updateEntryMetadata(entry.id, updated);
    await this.deps.cacheSingleMetadata(updated);
  }
}
