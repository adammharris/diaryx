// Cloud Mapping Repository
// Handles persistence of local<->cloud entry ID mappings and server timestamps in IndexedDB

import type { CloudEntryMapping, DBSchema } from '../../../storage/types';
import { openDB, type IDBPDatabase } from 'idb';
import { STORAGE_CONFIG } from '../utils/storage.utils';

export class CloudMappingRepository {
  private db: IDBPDatabase<DBSchema> | null = null;

  private async initDB(): Promise<IDBPDatabase<DBSchema>> {
    if (!this.db) {
      this.db = await openDB<DBSchema>(STORAGE_CONFIG.dbName, STORAGE_CONFIG.dbVersion);
    }
    return this.db;
  }

  async storeMapping(localId: string, cloudId: string, serverTimestamp?: string): Promise<void> {
    const db = await this.initDB();
    const mapping: CloudEntryMapping = {
      localId,
      cloudId,
      publishedAt: new Date().toISOString(),
      lastServerTimestamp: serverTimestamp
    };
    await db.put('cloudMappings', mapping);
  }

  async updateTimestamp(localId: string, serverTimestamp: string): Promise<void> {
    const db = await this.initDB();
    const mapping = await db.get('cloudMappings', localId);
    if (mapping) {
      mapping.lastServerTimestamp = serverTimestamp;
      await db.put('cloudMappings', mapping);
    }
  }

  async getLastServerTimestamp(localId: string): Promise<string | null> {
    const db = await this.initDB();
    const mapping = await db.get('cloudMappings', localId);
    return mapping?.lastServerTimestamp || null;
  }

  async getCloudId(localId: string): Promise<string | null> {
    const db = await this.initDB();
    const mapping = await db.get('cloudMappings', localId);
    return mapping?.cloudId || null;
  }

  async getLocalIdByCloudId(cloudId: string): Promise<string | null> {
    const db = await this.initDB();
    const tx = db.transaction('cloudMappings', 'readonly');
    const store = tx.objectStore('cloudMappings');
    const allMappings = await store.getAll();
    const match = allMappings.find(m => m.cloudId === cloudId);
    return match ? match.localId : null;
  }

  async removeMapping(localId: string): Promise<void> {
    const db = await this.initDB();
    await db.delete('cloudMappings', localId);
  }
}
