import { apiAuthService } from '../../api-auth.service';
import { e2eEncryptionService } from '../../e2e-encryption.service';
import { FrontmatterService } from '../../../storage/frontmatter.service';
import { PreviewService } from '../../../storage/preview.service';
import { metadataStore } from '../../../stores/metadata';
import { sharedEntryService } from '../../shared-entry.service';
import { tagService } from '../../tag.service';
import { tagSyncService } from '../../tag-sync.service';
import { fetch } from '../../../utils/fetch';
import { STORAGE_CONFIG, concurrencyManager, validateEncryptedData } from '../utils';
import type { JournalEntry, JournalEntryMetadata } from '../../../storage/types';
import type { EntryObject } from '../../../crypto/EntryCryptor';
import { CloudMappingRepository } from './cloud-mapping.repository';

export class CloudSyncServiceImpl {
  constructor(private deps: {
    getEntry: (id: string) => Promise<JournalEntry | null>;
    cacheSingleMetadata: (m: JournalEntryMetadata) => Promise<void>;
    updateEntryPublishStatusInMetadata: (id: string, published: boolean) => Promise<void>;
    getAllEntries: () => Promise<JournalEntryMetadata[]>;
    checkSyncConflicts: (id: string, modified: string) => Promise<{ hasConflict: boolean }>;
    // Import-related helpers
    environment: () => 'tauri' | 'web';
    saveFileForImport: (id: string, content: string) => Promise<void>;
    putIDBEntryForImport: (entry: JournalEntry) => Promise<void>;
    generateUniqueImportId: (title: string) => Promise<string>;
    entryExistsForImport: (filename: string) => Promise<boolean>;
  }) {}

  private mappingRepo = new CloudMappingRepository();

  async publishEntry(entryId: string, tagIds: string[] = []): Promise<boolean> {
    if (!apiAuthService.isAuthenticated()) return false;
    const e2e = e2eEncryptionService.getCurrentSession();
    if (!e2e || !e2e.isUnlocked) return false;

    return concurrencyManager.acquireCloudLock(entryId, async () => {
      try {
        let finalTagIds = tagIds;
        try {
          const syncRes = await tagSyncService.syncTagsToBackend(entryId, tagIds);
          if (syncRes.success) finalTagIds = syncRes.syncedTags;
        } catch {}

        const existing = await this.mappingRepo.getCloudId(entryId);
        if (existing) {
          return this.syncEntryToCloud(entryId, finalTagIds);
        }
        const entry = await this.deps.getEntry(entryId);
        if (!entry) return false;
        const parsed = FrontmatterService.parseContent(entry.content);
        const obj: EntryObject = { title: entry.title, content: entry.content, frontmatter: parsed.frontmatter, tags: FrontmatterService.extractTags(parsed.frontmatter) };
        const enc = e2eEncryptionService.encryptEntry(obj);
        if (!enc) return false;
        const hashes = e2eEncryptionService.generateHashes(obj);
        const meta = { ...e2eEncryptionService.createEncryptionMetadata(), contentNonceB64: enc.contentNonceB64 };
        const apiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
        const payload = { encrypted_title: enc.encryptedContentB64, encrypted_content: enc.encryptedContentB64, encrypted_frontmatter: parsed.hasFrontmatter ? JSON.stringify(parsed.frontmatter) : null, encryption_metadata: meta, title_hash: hashes.titleHash, content_preview_hash: hashes.previewHash, is_published: true, file_path: entry.file_path || `${entryId}.md`, owner_encrypted_entry_key: enc.encryptedEntryKeyB64, owner_key_nonce: enc.keyNonceB64, tag_ids: finalTagIds, client_modified_at: entry.modified_at };
        const resp = await fetch(`${apiUrl}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuthService.getAuthHeaders() }, body: JSON.stringify(payload) });
        if (!resp.ok) return false;
        const result = await resp.json();
        const cloudId = result.data?.entry?.id;
        const serverTimestamp = result.data?.entry?.updated_at;
        if (cloudId) {
          await this.mappingRepo.storeMapping(entryId, cloudId, serverTimestamp);
          await this.deps.updateEntryPublishStatusInMetadata(entryId, true);
          if (finalTagIds.length) { try { await sharedEntryService.shareEntry({ entryId: cloudId, tagIds: finalTagIds, encryptedEntryKey: enc.encryptedEntryKeyB64, keyNonce: enc.keyNonceB64 }); } catch {} }
        }
        return true;
      } catch {
        return false;
      }
    });
  }

  async unpublishEntry(entryId: string): Promise<boolean> {
    if (!apiAuthService.isAuthenticated()) return false;
    try {
      const cloudId = await this.mappingRepo.getCloudId(entryId);
      if (!cloudId) return false;
  try { await sharedEntryService.revokeAllEntryAccess(cloudId); } catch {}
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const resp = await fetch(`${apiUrl}/entries/${cloudId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...apiAuthService.getAuthHeaders() } });
      if (!resp.ok) return false;
      await this.mappingRepo.removeMapping(entryId);
      await this.deps.updateEntryPublishStatusInMetadata(entryId, false);
      return true;
    } catch { return false; }
  }

  async getEntryPublishStatus(entryId: string): Promise<boolean | null> {
    if (!apiAuthService.isAuthenticated()) return null;
    try {
      const cloudId = await this.mappingRepo.getCloudId(entryId);
      if (!cloudId) return false;
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const resp = await fetch(`${apiUrl}/entries/${cloudId}`, { method: 'GET', headers: { ...apiAuthService.getAuthHeaders() } });
      if (!resp.ok) { await this.mappingRepo.removeMapping(entryId); return false; }
      const data = await resp.json();
      return data.data?.is_published || false;
    } catch { return null; }
  }

  async syncEntryToCloud(entryId: string, tagIds: string[] = []): Promise<boolean> {
    if (!apiAuthService.isAuthenticated()) return false;
    const e2e = e2eEncryptionService.getCurrentSession();
    if (!e2e || !e2e.isUnlocked) return false;
    return concurrencyManager.acquireCloudLock(entryId, async () => {
      try {
        const cloudId = await this.mappingRepo.getCloudId(entryId);
        if (!cloudId) return false;
        const entry = await this.deps.getEntry(entryId);
        if (!entry) return false;
        const conflict = await this.deps.checkSyncConflicts(entryId, entry.modified_at);
        if (conflict.hasConflict) return false;
        if (tagIds.length) {
          try {
            const currentUsers = await sharedEntryService.getEntryAccessUsers(cloudId);
            const newUsersSet = new Set<string>();
            for (const tagId of tagIds) { (await tagService.getTagAssignments(tagId)).forEach((u: any) => newUsersSet.add(u.id)); }
            const newUsers = Array.from(newUsersSet);
            const usersToRemove = currentUsers.filter((u: string) => !newUsers.includes(u));
            if (usersToRemove.length) { try { await sharedEntryService.revokeEntryAccessForUsers(cloudId, usersToRemove); } catch {} }
          } catch {}
        }
        const baseUrl = import.meta.env.VITE_API_BASE_URL;
        const existingResp = await fetch(`${baseUrl}/entries/${cloudId}`, { method: 'GET', headers: { 'Content-Type': 'application/json', ...apiAuthService.getAuthHeaders() } });
        if (!existingResp.ok) return false;
        const existing = await existingResp.json();
        if (!existing.data?.access_key?.encrypted_entry_key || !existing.data?.access_key?.key_nonce) return false;
        const parsed = FrontmatterService.parseContent(entry.content);
        const obj: EntryObject = { title: entry.title, content: entry.content, frontmatter: parsed.frontmatter, tags: FrontmatterService.extractTags(parsed.frontmatter) };
        const enc = await e2eEncryptionService.encryptEntryWithExistingKey(obj, existing.data.access_key.encrypted_entry_key, existing.data.access_key.key_nonce);
        if (!enc) return false;
        const hashes = e2eEncryptionService.generateHashes(obj);
        const meta = { ...e2eEncryptionService.createEncryptionMetadata(), contentNonceB64: enc.contentNonceB64 };
        const lastServerTs = await this.mappingRepo.getLastServerTimestamp(entryId);
        const apiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
        const payload = { encrypted_title: enc.encryptedContentB64, encrypted_content: enc.encryptedContentB64, encrypted_frontmatter: parsed.hasFrontmatter ? JSON.stringify(parsed.frontmatter) : null, encryption_metadata: meta, title_hash: hashes.titleHash, content_preview_hash: hashes.previewHash, is_published: true, file_path: entry.file_path || `${entryId}.md`, owner_encrypted_entry_key: enc.encryptedEntryKeyB64, owner_key_nonce: enc.keyNonceB64, client_modified_at: entry.modified_at, if_unmodified_since: lastServerTs };
        const resp = await fetch(`${apiUrl}/entries/${cloudId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...apiAuthService.getAuthHeaders() }, body: JSON.stringify(payload) });
        if (!resp.ok) return false;
        const data = await resp.json();
        const updatedTs = data.data?.updated_at;
        if (updatedTs) await this.mappingRepo.updateTimestamp(entryId, updatedTs);
  if (tagIds.length) { try { await sharedEntryService.shareEntry({ entryId: cloudId, tagIds, encryptedEntryKey: enc.encryptedEntryKeyB64, keyNonce: enc.keyNonceB64 }); } catch {} }
        return true;
      } catch { return false; }
    });
  }

  async fetchCloudEntries(): Promise<any[]> {
    if (!apiAuthService.isAuthenticated()) return [];
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const resp = await fetch(`${apiUrl}/entries`, { method: 'GET', headers: { ...apiAuthService.getAuthHeaders() } });
      if (!resp.ok) return [];
      const result = await resp.json();
      return result.data || [];
    } catch { return []; }
  }

  async hasCloudEntries(): Promise<boolean> {
    const entries = await this.fetchCloudEntries();
    return entries.length > 0;
  }

  async importCloudEntries(): Promise<number> {
    if (concurrencyManager.isSyncInProgress()) return 0;
    concurrencyManager.setSyncInProgress(true);
    try {
      const cloudEntries = await this.fetchCloudEntries();
      if (!cloudEntries.length) return 0;
      const e2e = e2eEncryptionService.getCurrentSession();
      if (!e2e || !e2e.isUnlocked) return 0;
      let imported = 0;
      for (const cloudEntry of cloudEntries) {
        try {
          const currentUserId = e2eEncryptionService.getCurrentUserId();
          const currentUserPk = e2eEncryptionService.getCurrentPublicKey();
          if (cloudEntry.author?.id !== currentUserId || cloudEntry.author?.public_key !== currentUserPk) continue;
          const existingLocalId = await this.mappingRepo.getLocalIdByCloudId(cloudEntry.id);
          if (!cloudEntry.access_key?.encrypted_entry_key) {
            if (cloudEntry.owner_encrypted_entry_key && cloudEntry.owner_key_nonce) {
              cloudEntry.access_key = { encrypted_entry_key: cloudEntry.owner_encrypted_entry_key, key_nonce: cloudEntry.owner_key_nonce };
            } else continue;
          }
            // Parse encryption metadata
          let encryptionMetadata: any;
          try { encryptionMetadata = typeof cloudEntry.encryption_metadata === 'string' ? JSON.parse(cloudEntry.encryption_metadata) : cloudEntry.encryption_metadata; } catch { continue; }
          const contentNonceB64 = encryptionMetadata?.contentNonceB64; if (!contentNonceB64) continue;
          const authorPk = cloudEntry.author?.public_key; if (!authorPk) continue;
          const encryptedData = {
            encryptedContentB64: cloudEntry.encrypted_content,
            contentNonceB64,
            encryptedEntryKeyB64: cloudEntry.access_key.encrypted_entry_key,
            keyNonceB64: cloudEntry.access_key.key_nonce
          };
          if (!validateEncryptedData(encryptedData)) continue;
          const decrypted = e2eEncryptionService.decryptEntry(encryptedData, authorPk);
          if (!decrypted || !decrypted.content) continue;
          let localId = existingLocalId;
          if (!localId) localId = await this.deps.generateUniqueImportId(decrypted.title || 'Untitled Entry');
          const journalEntry: JournalEntry = {
            id: localId,
            title: decrypted.title,
            content: decrypted.content,
            created_at: cloudEntry.created_at,
            modified_at: cloudEntry.updated_at,
            file_path: `${localId}.md`
          };
          if (this.deps.environment() === 'tauri') {
            await this.deps.saveFileForImport(localId, journalEntry.content);
          } else {
            await this.deps.putIDBEntryForImport(journalEntry);
          }
          const metadata: JournalEntryMetadata = {
            id: journalEntry.id,
            title: journalEntry.title,
            created_at: journalEntry.created_at,
            modified_at: journalEntry.modified_at,
            file_path: journalEntry.file_path,
            preview: PreviewService.createPreview(journalEntry.content),
            isPublished: true
          };
          await this.deps.cacheSingleMetadata(metadata);
          metadataStore.updateEntryMetadata(journalEntry.id, metadata);
          await this.mappingRepo.storeMapping(localId, cloudEntry.id, cloudEntry.updated_at);
          imported++;
        } catch {
          // Continue other entries
        }
      }
      if (imported > 0) {
        try { await this.deps.getAllEntries(); } catch {}
      }
      return imported;
    } finally {
      concurrencyManager.setSyncInProgress(false);
    }
  }

  async performBidirectionalSync(): Promise<{ imported: number; uploaded: number; conflicts: number }> {
    if (concurrencyManager.getSyncStatus().inProgress) {
      return { imported: 0, uploaded: 0, conflicts: 0 };
    }
    concurrencyManager.setSyncInProgress(true);
    let imported = 0; let uploaded = 0; let conflicts = 0;
    try {
      imported = await this.importCloudEntries();
      const localEntries = await this.deps.getAllEntries();
      for (const localEntry of localEntries) {
        try {
          const cloudId = await this.mappingRepo.getCloudId(localEntry.id);
          if (!cloudId) continue;
          const conflict = await this.deps.checkSyncConflicts(localEntry.id, localEntry.modified_at);
          if (conflict.hasConflict) { conflicts++; continue; }
          const ok = await this.syncEntryToCloud(localEntry.id);
          if (ok) uploaded++;
        } catch { /* skip */ }
      }
      return { imported, uploaded, conflicts };
    } finally {
      concurrencyManager.setSyncInProgress(false);
    }
  }

  async syncAfterLogin(): Promise<number> {
    try {
      const hasEntries = await this.hasCloudEntries();
      if (!hasEntries) return 0;
      const e2e = e2eEncryptionService.getCurrentSession();
      if (!e2e || !e2e.isUnlocked) return 0;
      const imported = await this.importCloudEntries();
      return imported;
    } catch { return 0; }
  }
}
