/**
 * Main storage module exports
 */

// Types
export type {
    JournalEntry,
    JournalEntryMetadata,
    StorageResult,
    IStorageAdapter,
    StorageEnvironment
} from './types.js';

// Services
export { PreviewService } from './preview.service';
export { TitleService } from './title.service';

// New unified service
export { storageService } from '../services/storage';
