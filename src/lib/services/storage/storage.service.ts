// Storage Orchestrator (refactored from legacy monolith)
// Provides unified interface while delegating concerns to specialized services.

import { openDB, type IDBPDatabase } from 'idb';
import { writeTextFile, exists, mkdir, watch } from '@tauri-apps/plugin-fs';
import { fetch } from '../../utils/fetch';
import type { JournalEntry, JournalEntryMetadata, DBSchema, StorageEnvironment } from '../../storage/types';
import { metadataStore } from '../../stores/metadata';
import { PreviewService } from '../../storage/preview.service';
import { apiAuthService } from '../api-auth.service';
import { e2eEncryptionService } from '../e2e-encryption.service';
import type { EntryObject } from '../../crypto/EntryCryptor';
import { entrySharingService } from '../entry-sharing.service';
import { tagSyncService, type TagSyncResult } from '../tag-sync.service';
import {
  STORAGE_CONFIG,
  titleToSafeFilename,
  detectEnvironment,
  getJournalDisplayPath,
  isBuildEnvironment,
  concurrencyManager,
  type StorageProvider,
  TauriStorageProvider,
  IndexedDBStorageProvider
} from './utils';
import { LocalEntryService } from './local-entry.service';
import { MetadataCacheService, EntryCacheService } from './metadata-cache.service';
import { FilesystemWatcherService } from './filesystem-watcher.service';
import { TauriEntryScannerService } from './tauri-entry-scanner.service';
import { CloudMappingRepository } from './cloud/cloud-mapping.repository';
import { CloudSyncServiceImpl } from './cloud/cloud-sync.service';
import { SyncConflictService } from './sync-conflict.service';

export interface StorageServiceOptions {
  environment?: StorageEnvironment;
  storageProvider?: StorageProvider;
  cloudMappingRepo?: CloudMappingRepository;
  cloudSync?: CloudSyncServiceImpl;
}

export class StorageService {
  public environment: StorageEnvironment;
  private db: IDBPDatabase<DBSchema> | null = null;
  private fileWatcher: (() => void) | null = null; // kept for UI usage
  private storageProvider: StorageProvider;
  private cloudMappingRepo: CloudMappingRepository;
  private cloudSync: CloudSyncServiceImpl;
  private metadataCache = new MetadataCacheService(() => this.initDB());
  private entryCache = new EntryCacheService(() => this.initDB());
  private fsWatcher = new FilesystemWatcherService(() => this.environment);
  private tauriScanner = new TauriEntryScannerService(() => this.storageProvider as TauriStorageProvider);
  private conflictService = new SyncConflictService((id) => this.getCloudId(id), (id) => this.removeCloudMapping(id));
  private localEntryService = new LocalEntryService({
    environment: () => this.environment as 'tauri' | 'web',
    storageProvider: () => this.storageProvider,
    entryCache: this.entryCache,
    cacheSingleMetadata: (m) => this.metadataCache.cacheSingleMetadata(m),
    updateEntryPublishStatusInMetadata: (id, p) => this.updateEntryPublishStatusInMetadata(id, p)
  });

  constructor(options: StorageServiceOptions = {}) {
    this.environment = options.environment ?? detectEnvironment();
    this.storageProvider = options.storageProvider ?? (this.environment === 'tauri' ? new TauriStorageProvider() : new IndexedDBStorageProvider());
    this.cloudMappingRepo = options.cloudMappingRepo ?? new CloudMappingRepository();

    if (this.environment === 'web') {
      this.initDB(); // warm up IDB
    }

    this.initializeStorageProvider();

    this.cloudSync = options.cloudSync ?? new CloudSyncServiceImpl({
      getEntry: (id) => this.getEntry(id),
      cacheSingleMetadata: (m) => this.metadataCache.cacheSingleMetadata(m),
      updateEntryPublishStatusInMetadata: (id, p) => this.updateEntryPublishStatusInMetadata(id, p),
      getAllEntries: () => this.getAllEntries(),
      checkSyncConflicts: (id, mod) => this.checkSyncConflicts(id, mod),
      environment: () => this.environment as 'tauri' | 'web',
      saveFileForImport: async (id, content) => {
        const filePath = `${STORAGE_CONFIG.journalFolder}/${id}${STORAGE_CONFIG.fileExtension}`;
        await writeTextFile(filePath, content, { baseDir: STORAGE_CONFIG.baseDir });
      },
      putIDBEntryForImport: async (entry) => {
        const db = await this.initDB();
        await db.put('entries', entry);
      },
      generateUniqueImportId: (title) => this.generateUniqueFilenameForImport(title),
      entryExistsForImport: (filename) => this.entryExistsForImport(filename)
    });
  }

  // Initialization
  private async initializeStorageProvider(): Promise<void> {
    try { await this.storageProvider.initialize(); } catch (e) { console.error('Failed init storage provider', e); }
  }
  public getJournalPath(): string { return getJournalDisplayPath(this.environment, STORAGE_CONFIG.journalFolder); }
  private async initDB(): Promise<IDBPDatabase<DBSchema>> {
    if (!this.db) {
      this.db = await openDB<DBSchema>(STORAGE_CONFIG.dbName, STORAGE_CONFIG.dbVersion, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('entries')) { const s = db.createObjectStore('entries', { keyPath: 'id' }); s.createIndex('by-date', 'modified_at'); }
          if (!db.objectStoreNames.contains('metadata')) { const m = db.createObjectStore('metadata', { keyPath: 'id' }); m.createIndex('by-date', 'modified_at'); }
          if (!db.objectStoreNames.contains('cloudMappings')) { db.createObjectStore('cloudMappings', { keyPath: 'localId' }); }
        }
      });
    }
    return this.db;
  }

  // Entry APIs
  async getAllEntries(): Promise<JournalEntryMetadata[]> {
    if (isBuildEnvironment()) return [];
    if (this.environment === 'tauri') {
      try {
        const entries = await this.getTauriEntries();
        await this.cacheMetadata(entries);
        metadataStore.setAllEntries(entries);
        return entries;
      } catch (err) {
        console.error('FS entries failed, using cache', err);
        const cached = await this.metadataCache.getCachedMetadata();
        metadataStore.setAllEntries(cached);
        return cached;
      }
    } else {
      await this.createDefaultEntriesForWeb();
      const webEntries = await this.metadataCache.getCachedMetadata();
      metadataStore.setAllEntries(webEntries);
      return webEntries;
    }
  }
  async getEntry(id: string): Promise<JournalEntry | null> {
    if (isBuildEnvironment()) return null;
    if (this.environment === 'tauri') {
      try { const e = await this.storageProvider.getEntry(id); if (e) await this.entryCache.cacheEntry(e); return e; }
      catch (err) { console.error('Get entry fallback cache', err); return this.entryCache.getCachedEntry(id); }
    }
    return this.storageProvider.getEntry(id);
  }
  async saveEntry(id: string, content: string): Promise<boolean> { return this.localEntryService.saveEntry(id, content); }
  async createEntry(title: string): Promise<string | null> { return this.localEntryService.createEntry(title); }
  async renameEntry(oldId: string, newTitle: string): Promise<string | null> { return this.localEntryService.renameEntry(oldId, newTitle); }
  async updateDecryptedTitle(entryId: string, decryptedContent: string): Promise<void> { return this.localEntryService.updateDecryptedTitle(entryId, decryptedContent); }
  private async updateMetadataFromEntry(entry: JournalEntry): Promise<void> { return this.localEntryService.updateMetadataFromEntry(entry); }

  async deleteEntry(id: string): Promise<boolean> { if (isBuildEnvironment()) return false; return this.deleteEntryWithCloudSync(id); }
  private async deleteEntryWithCloudSync(id: string): Promise<boolean> {
    return concurrencyManager.acquireCloudLock(id, async () => {
      try {
        const cloudId = await this.getCloudId(id);
        if (cloudId && apiAuthService.isAuthenticated()) { await this.deleteFromCloud(cloudId); }
        const localOk = await this.storageProvider.deleteEntry(id);
        if (localOk && this.environment === 'tauri') await this.entryCache.deleteCachedEntry(id);
        if (cloudId) await this.removeCloudMapping(id);
        return localOk;
      } catch (e) { console.error('Delete failed', e); return false; }
    });
  }
  private async deleteFromCloud(cloudId: string): Promise<boolean> {
    try {
      const apiUrl = (import.meta.env.VITE_API_BASE_URL);
      const res = await fetch(`${apiUrl}/entries/${cloudId}`, { method: 'DELETE', headers: { ...apiAuthService.getAuthHeaders() } });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      return true;
    } catch (e) { console.error('Cloud delete failed', e); return false; }
  }

  // Watching (legacy direct)
  async startFileWatching(onChange: (changed?: string[], type?: string) => void): Promise<void> {
    if (this.environment === 'tauri' && !this.fileWatcher) {
      this.fileWatcher = await watch([STORAGE_CONFIG.journalFolder], (event) => {
        if (!event.type || typeof event.type !== 'object') return;
        if ('access' in event.type) return;
        const hasModify = 'modify' in event.type; const hasCreate = 'create' in event.type; const hasRemove = 'remove' in event.type;
        if (!hasModify && !hasCreate && !hasRemove) return;
        const changed = event.paths || [];
        let kind = 'unknown';
        if (hasModify) kind = (event.type as any)?.modify?.kind || 'modify'; else if (hasCreate) kind = 'create'; else if (hasRemove) kind = 'remove';
        onChange(changed, kind);
      }, { baseDir: STORAGE_CONFIG.baseDir, delayMs: 500 });
    }
  }
  stopFileWatching(): void { if (this.fileWatcher) { this.fileWatcher(); this.fileWatcher = null; } }

  // Cache helpers
  private async cacheMetadata(entries: JournalEntryMetadata[]): Promise<void> {
    const db = await this.initDB();
    const existing = await db.getAllFromIndex('metadata', 'by-date');
    const existingMap = new Map(existing.map(m => [m.id, m]));
    const tx = db.transaction('metadata', 'readwrite'); const store = tx.objectStore('metadata');
    for (const e of entries) await store.put(e);
    const newIds = new Set(entries.map(e => e.id));
    for (const id of existingMap.keys()) if (!newIds.has(id)) await store.delete(id);
    await tx.done;
  }
  private async createDefaultEntriesForWeb(): Promise<void> { await this.metadataCache.createDefaultEntriesForWeb(e => this.entryCache.cacheEntry(e), e => this.updateMetadataFromEntry(e)); }
  private async updateEntryPublishStatusInMetadata(entryId: string, isPublished: boolean): Promise<void> {
    try { const db = await this.initDB(); const m = await db.get('metadata', entryId); if (m) { const u = { ...m, isPublished }; await db.put('metadata', u); metadataStore.updateEntryMetadata(entryId, u); } }
    catch (e) { console.warn('Publish status update failed', e); }
  }
  private async ensureDirectoryExists(): Promise<void> { if (!(await exists(STORAGE_CONFIG.journalFolder, { baseDir: STORAGE_CONFIG.baseDir }))) await mkdir(STORAGE_CONFIG.journalFolder, { baseDir: STORAGE_CONFIG.baseDir, recursive: true }); }
  private async getTauriEntries(): Promise<JournalEntryMetadata[]> { await this.ensureDirectoryExists(); return this.tauriScanner.scan(); }

  // Cloud sync delegation
  private async checkSyncConflicts(entryId: string, localModified: string): Promise<{ hasConflict: boolean; cloudEntry?: any }> { return this.conflictService.check(entryId, localModified); }
  async publishEntry(entryId: string, tagIds: string[] = []): Promise<boolean> { return this.cloudSync.publishEntry(entryId, tagIds); }
  async unpublishEntry(entryId: string): Promise<boolean> { return this.cloudSync.unpublishEntry(entryId); }
  async getEntryPublishStatus(entryId: string): Promise<boolean | null> { return this.cloudSync.getEntryPublishStatus(entryId); }
  async syncEntryToCloud(entryId: string, tagIds: string[] = []): Promise<boolean> { return this.cloudSync.syncEntryToCloud(entryId, tagIds); }
  async fetchCloudEntries(): Promise<any[]> { return this.cloudSync.fetchCloudEntries(); }
  async importCloudEntries(): Promise<number> { return this.cloudSync.importCloudEntries(); }
  async hasCloudEntries(): Promise<boolean> { return this.cloudSync.hasCloudEntries(); }
  async syncAfterLogin(): Promise<number> { return this.cloudSync.syncAfterLogin(); }
  async performBidirectionalSync(): Promise<{ imported: number; uploaded: number; conflicts: number }> { return this.cloudSync.performBidirectionalSync(); }

  // Cloud mapping
  async getCloudId(localId: string): Promise<string | null> { return this.cloudMappingRepo.getCloudId(localId); }
  private async removeCloudMapping(localId: string): Promise<void> { await this.cloudMappingRepo.removeMapping(localId); }
  async getLocalEntryIdFromCloudId(cloudId: string): Promise<string | null> {
    try { const db = await this.initDB(); const tx = db.transaction(['cloudMappings'], 'readonly'); const store = tx.objectStore('cloudMappings'); const all = await store.getAll(); const m = all.find(m => m.cloudId === cloudId); return m ? m.localId : null; }
    catch (e) { console.error('Reverse mapping failed', e); return null; }
  }

  // Shared entries
  async getSharedEntries(): Promise<JournalEntryMetadata[]> {
    if (!apiAuthService.isAuthenticated()) return [];
    try {
      const apiUrl = (import.meta.env.VITE_API_BASE_URL); const res = await fetch(`${apiUrl}/entries/shared-with-me`, { method: 'GET', headers: { ...apiAuthService.getAuthHeaders() } });
      if (!res.ok) throw new Error(String(res.status));
      const result = await res.json(); const shared = result.data || []; const out: JournalEntryMetadata[] = [];
      for (const ce of shared) {
        try { const dec = await this.decryptCloudEntry(ce); if (dec) { out.push({ id: `shared-${ce.id}`, title: dec.title, created_at: ce.created_at, modified_at: ce.updated_at, file_path: ce.file_path || 'shared-entry.md', preview: PreviewService.createPreview(dec.content), isPublished: true, isShared: true, cloudId: ce.id }); continue; } }
        catch (e) { console.warn('Decrypt shared failed', e); }
        out.push({ id: `shared-${ce.id}`, title: '🔒 Encrypted Entry', created_at: ce.created_at, modified_at: ce.updated_at, file_path: ce.file_path || 'shared-entry.md', preview: 'This entry is encrypted and cannot be previewed.', isPublished: true, isShared: true, cloudId: ce.id });
      }
      return out;
    } catch (e) { console.error('Get shared entries failed', e); return []; }
  }
  async getSharedEntry(cloudId: string): Promise<JournalEntry | null> {
    if (!apiAuthService.isAuthenticated()) return null;
    try { const apiUrl = (import.meta.env.VITE_API_BASE_URL); const res = await fetch(`${apiUrl}/entries/${cloudId}`, { method: 'GET', headers: { ...apiAuthService.getAuthHeaders() } }); if (!res.ok) throw new Error(String(res.status)); const result = await res.json(); const cloudEntry = result.data; const dec = await this.decryptCloudEntry(cloudEntry); if (!dec) throw new Error('Decrypt failed'); return { id: `shared-${cloudId}`, title: dec.title, content: dec.content, created_at: cloudEntry.created_at, modified_at: cloudEntry.updated_at, file_path: cloudEntry.file_path || 'shared-entry.md' }; } catch (e) { console.error('Get shared entry failed', e); return null; }
  }
  private async decryptCloudEntry(cloudEntry: any): Promise<EntryObject | null> {
    if (!e2eEncryptionService.isUnlocked()) throw new Error('E2E encryption not unlocked');
    try { const accessKey = await entrySharingService.getEntryAccessKey(cloudEntry.id); if (!accessKey) throw new Error('No access key'); const entryKey = e2eEncryptionService.rewrapEntryKeyForUser(accessKey.encrypted_entry_key, accessKey.key_nonce, cloudEntry.author_public_key); if (!entryKey) throw new Error('Entry key decrypt failed'); const encryptedData = { encryptedContentB64: cloudEntry.encrypted_content, contentNonceB64: cloudEntry.encryption_metadata?.contentNonceB64, encryptedEntryKeyB64: entryKey.encryptedEntryKeyB64, keyNonceB64: entryKey.keyNonceB64 }; return e2eEncryptionService.decryptEntry(encryptedData, cloudEntry.author_public_key); } catch (e) { console.error('Decrypt cloud entry failed', e); return null; }
  }

  // Concurrency status
  public getSyncStatus(): { inProgress: boolean; activeOperations: string[] } { return concurrencyManager.getSyncStatus(); }
  public cancelSyncOperations(): void { concurrencyManager.cancelSyncOperations(); }

  // Tag sync facades
  async syncTagsToBackend(entryId: string, existingBackendTagIds: string[] = []): Promise<TagSyncResult> {
    try { const entry = await this.getEntry(entryId); if (!entry) return { success: false, syncedTags: existingBackendTagIds, createdTags: [], conflicts: [], error: 'Entry not found' }; return await tagSyncService.syncFrontmatterToBackend(entryId, entry.content, existingBackendTagIds); }
    catch (e) { return { success: false, syncedTags: existingBackendTagIds, createdTags: [], conflicts: [], error: e instanceof Error ? e.message : 'Unknown error' }; }
  }
  async syncTagsFromBackend(entryId: string, backendTagIds: string[]): Promise<boolean> {
    try { const entry = await this.getEntry(entryId); if (!entry) return false; const result = await tagSyncService.syncBackendToFrontmatter(entryId, entry.content, backendTagIds); if (!result.success) return false; if (result.addedTags.length) { if (!(await this.saveEntry(entryId, result.updatedContent))) return false; await this.updateDecryptedTitle(entryId, result.updatedContent); } return true; } catch { return false; }
  }
  async getFrontmatterTags(entryId: string): Promise<string[]> { try { const entry = await this.getEntry(entryId); return entry ? tagSyncService.getFrontmatterTags(entry.content) : []; } catch { return []; } }
  async needsTagSync(entryId: string, backendTagIds: string[]): Promise<boolean> { try { const tags = await this.getFrontmatterTags(entryId); return tagSyncService.needsSync(entryId, tags, backendTagIds); } catch { return false; } }

  // Import helpers
  private async generateUniqueFilenameForImport(baseTitle: string): Promise<string> { const safe = titleToSafeFilename(baseTitle); let name = safe; let c = 1; while (await this.entryExistsForImport(name)) { name = `${safe}-${c++}`; } return name; }
  private async entryExistsForImport(filename: string): Promise<boolean> { if (this.environment === 'tauri') { const filePath = `${STORAGE_CONFIG.journalFolder}/${filename}${STORAGE_CONFIG.fileExtension}`; return await exists(filePath, { baseDir: STORAGE_CONFIG.baseDir }); } const db = await this.initDB(); return !!(await db.get('entries', filename)); }
}

export const storageService = new StorageService();
