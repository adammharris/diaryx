import { watch } from '@tauri-apps/plugin-fs';
import { STORAGE_CONFIG } from './utils';

export type FileChangeEvent = {
  path: string;
  event: 'create' | 'modify' | 'remove';
};

export class FilesystemWatcherService {
  private watcherStop: (() => void) | null = null;
  constructor(private environment: () => string) {}

  async start(onChange: (changes: FileChangeEvent[], eventType: FileChangeEvent['event']) => void): Promise<void> {
    if (this.environment() !== 'tauri' || this.watcherStop) return;
    this.watcherStop = await watch(
      STORAGE_CONFIG.journalFolder,
      (change: any) => {
        const changedFiles = (change.paths || [])
          .filter((p: string) => p.endsWith(STORAGE_CONFIG.fileExtension))
          .map((p: string) => ({ path: p, event: 'modify' as const }));
        if (!changedFiles.length) return;
        // Basic heuristic: if count increased vs internal state we could refine; default to modify
        onChange(changedFiles, 'modify');
      },
      { baseDir: STORAGE_CONFIG.baseDir, delayMs: 500 }
    );
  }

  stop(): void { if (this.watcherStop) { this.watcherStop(); this.watcherStop = null; } }
}
