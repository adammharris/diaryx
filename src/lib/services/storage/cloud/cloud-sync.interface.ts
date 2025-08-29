// Cloud sync service interface definitions
// (Avoid importing unused types to prevent path issues)
// (No external type imports needed currently)

export interface PublishResult {
  success: boolean;
  alreadyPublished?: boolean;
}

export interface BidirectionalSyncResult {
  imported: number;
  uploaded: number;
  conflicts: number;
}

export interface CloudSyncService {
  publishEntry(entryId: string, tagIds?: string[]): Promise<boolean>;
  unpublishEntry(entryId: string): Promise<boolean>;
  getEntryPublishStatus(entryId: string): Promise<boolean | null>;
  syncEntryToCloud(entryId: string, tagIds?: string[]): Promise<boolean>;
  fetchCloudEntries(): Promise<any[]>;
  importCloudEntries(): Promise<number>;
  performBidirectionalSync(): Promise<BidirectionalSyncResult>;
  getCloudId(localId: string): Promise<string | null>;
  getLocalEntryIdFromCloudId(cloudId: string): Promise<string | null>;
}
