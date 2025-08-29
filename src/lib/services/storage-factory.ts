import type { StorageEnvironment } from '../storage/types';
import { StorageService, type StorageServiceOptions } from './storage';
import { TauriStorageProvider, IndexedDBStorageProvider, type StorageProvider } from './storage/utils';
import { CloudMappingRepository } from './storage/cloud/cloud-mapping.repository';
import { CloudSyncServiceImpl } from './storage/cloud/cloud-sync.service';

export interface StorageFactoryOverrides {
  environment?: StorageEnvironment;
  storageProvider?: StorageProvider;
  cloudMappingRepo?: CloudMappingRepository;
  cloudSync?: CloudSyncServiceImpl;
}

/**
 * Factory to build a fully wired StorageService with optional overrides for testing.
 */
export function createStorageService(overrides: StorageFactoryOverrides = {}) {
  const opts: StorageServiceOptions = {
    environment: overrides.environment,
    storageProvider: overrides.storageProvider,
    cloudMappingRepo: overrides.cloudMappingRepo,
    cloudSync: overrides.cloudSync
  };
  return new StorageService(opts);
}

// Default singleton (can be avoided in tests)
export const storageService = createStorageService();
