import type { IDBPDatabase } from 'idb';
import type { DBSchema, CloudEntryMapping } from '../../storage/types';
import { STORAGE_CONFIG } from '../utils';

export class CloudMappingService {
  constructor(private getDB: () => Promise<IDBPDatabase<DBSchema>>) {}

  async storeMapping(localId: string, cloudId: string, serverTimestamp?: string): Promise<void> {
    const db = await this.getDB();
    const mapping: CloudEntryMapping = {
      localId,
      cloudId,
      publishedAt: new Date().toISOString(),
      lastServerTimestamp: serverTimestamp
    };
    await db.put('cloudMappings', mapping);
  }

  async updateTimestamp(localId: string, serverTimestamp: string): Promise<void> {
    const db = await this.getDB();
    const mapping = await db.get('cloudMappings', localId);
    if (mapping) {
      mapping.lastServerTimestamp = serverTimestamp;
      await db.put('cloudMappings', mapping);
    }
  }

  async getLastServerTimestamp(localId: string): Promise<string | null> {
    const db = await this.getDB();
    const mapping = await db.get('cloudMappings', localId);
    return mapping?.lastServerTimestamp || null;
  }

  async getCloudId(localId: string): Promise<string | null> {
    const db = await this.getDB();
    const mapping = await db.get('cloudMappings', localId);
    return mapping?.cloudId || null;
  }

  async getLocalIdByCloudId(cloudId: string): Promise<string | null> {
    const db = await this.getDB();
    const tx = db.transaction('cloudMappings', 'readonly');
    const store = tx.objectStore('cloudMappings');
    const all = await store.getAll();
    const mapping = all.find(m => m.cloudId === cloudId);
    return mapping?.localId || null;
  }

  async removeMapping(localId: string): Promise<void> {
    const db = await this.getDB();
    await db.delete('cloudMappings', localId);
  }
}

export const createCloudMappingService = (getDB: () => Promise<IDBPDatabase<DBSchema>>) =>
  new CloudMappingService(getDB);
