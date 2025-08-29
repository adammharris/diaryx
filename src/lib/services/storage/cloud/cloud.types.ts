// Cloud service related types
export interface CloudPublishResult {
  success: boolean;
  cloudId?: string;
  error?: string;
}

export interface CloudSyncSummary {
  imported: number;
  uploaded: number;
  conflicts: number;
}
