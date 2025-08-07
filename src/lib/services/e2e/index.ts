/**
 * E2E Encryption Service - Main Exports
 * 
 * Provides clean, organized exports for the E2E encryption system.
 * This is the main entry point for external consumers.
 */

// ============================================================================
// MAIN SERVICE EXPORTS
// ============================================================================

// Primary service and store (most common imports)
export { e2eEncryptionService } from './e2e-encryption.service.js';
export { e2eSessionStore } from './e2e-encryption.service.js';

// ============================================================================
// INDIVIDUAL SERVICE EXPORTS (for advanced usage)
// ============================================================================

// Authentication service
export { e2eAuth } from './auth.service.js';

// Session management
export { sessionManager } from './session-manager.service.js';

// Local storage operations
export { e2eStorage } from './storage.service.js';

// Biometric authentication
export { e2eBiometric } from './biometric.service.js';

// Cloud synchronization
export { e2eCloudSync } from './cloud-sync.service.js';

// Debug utilities
export { e2eDebug } from './debug.service.js';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// All types from types.ts
export type * from './types.js';

// Types from crypto modules (re-exported for convenience)
export type { UserKeyPair, UserKeyPairB64 } from '../../crypto/KeyManager.js';
export type { EntryObject, EncryptedEntryData } from '../../crypto/EntryCryptor.js';
export type { BiometricAuthResult } from '../biometric-auth.service.js';

// ============================================================================
// SERVICE CLASS EXPORTS (for dependency injection or custom instantiation)
// ============================================================================

export { E2EEncryptionService } from './e2e-encryption.service.js';
export { E2EAuthService } from './auth.service.js';
export { E2ESessionManager } from './session-manager.service.js';
export { E2EStorageService } from './storage.service.js';
export { E2EBiometricService } from './biometric.service.js';
export { E2ECloudSyncService } from './cloud-sync.service.js';
export { E2EDebugService } from './debug.service.js';