import type { IDBPDatabase } from 'idb';
import type { DBSchema, JournalEntryMetadata, JournalEntry } from '../../storage/types';
import { createDefaultWebEntries } from '../storage/utils';

export class MetadataCacheService {
  constructor(private getDB: () => Promise<IDBPDatabase<DBSchema>>) {}

  async cacheMetadata(entries: JournalEntryMetadata[]): Promise<void> {
    const db = await this.getDB();
    const existingMetadata = await db.getAllFromIndex('metadata', 'by-date');
    const existingMap = new Map(existingMetadata.map(m => [m.id, m]));
    const tx = db.transaction('metadata', 'readwrite');
    const store = tx.objectStore('metadata');
    for (const entry of entries) { await store.put(entry); }
    const newEntryIds = new Set(entries.map(e => e.id));
    for (const existingId of existingMap.keys()) { if (!newEntryIds.has(existingId)) { await store.delete(existingId); } }
    await tx.done;
  }

  async cacheSingleMetadata(metadata: JournalEntryMetadata): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('metadata', 'readwrite');
    await tx.objectStore('metadata').put(metadata);
    await tx.done;
  }

  async debugMetadataTable(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('metadata', 'readonly');
      const all = await tx.store.getAll();
      await tx.done;
      console.log('=== METADATA TABLE DEBUG ===');
      console.log('Total entries in metadata table:', all.length);
      all.forEach(m => console.log(`  - ID: ${m.id}, Title: ${m.title}, Published: ${m.isPublished}`));
      console.log('=== END METADATA DEBUG ===');
    } catch (e) { console.error('Failed to debug metadata table:', e); }
  }

  async getCachedMetadata(): Promise<JournalEntryMetadata[]> {
    const db = await this.getDB();
    const index = db.transaction('metadata').store.index('by-date');
    return (await index.getAll()).reverse();
  }

  async createDefaultEntriesForWeb(cacheEntry: (e: JournalEntry) => Promise<void>, updateMetadataFromEntry: (e: JournalEntry) => Promise<void>): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('entries', 'readonly');
    const count = await tx.store.count();
    await tx.done;
    if (count === 0) {
      const defaults = createDefaultWebEntries();
      for (const entry of defaults) { await cacheEntry(entry); await updateMetadataFromEntry(entry); }
    }
  }
}

export class EntryCacheService {
  constructor(private getDB: () => Promise<IDBPDatabase<DBSchema>>) {}
  async cacheEntry(entry: JournalEntry): Promise<void> { const db = await this.getDB(); await db.put('entries', entry); }
  async getCachedEntry(id: string): Promise<JournalEntry | null> { const db = await this.getDB(); return (await db.get('entries', id)) || null; }
  async deleteCachedEntry(id: string): Promise<void> { const db = await this.getDB(); const tx = db.transaction(['entries','metadata','cloudMappings'],'readwrite'); await tx.objectStore('entries').delete(id); await tx.objectStore('metadata').delete(id); await tx.objectStore('cloudMappings').delete(id); await tx.done; }
}
