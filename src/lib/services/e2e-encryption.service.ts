/**
 * E2E Encryption Service - Compatibility Layer
 * 
 * This file maintains backward compatibility for existing imports.
 * All functionality has been moved to the /services/e2e/ folder structure.
 * 
 * @deprecated Import from '$lib/services/e2e' instead
 */

// Re-export everything from the new modular structure
export * from './e2e/index.js';

// Maintain the old default exports for compatibility
export { e2eEncryptionService } from './e2e/index.js';
export { e2eSessionStore } from './e2e/index.js';