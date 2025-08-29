/**
 * Environment Detection Utilities
 * 
 * Provides utilities for detecting the runtime environment
 * and configuring storage appropriately.
 */

import { detectTauri } from '../../../utils/tauri';
import type { StorageEnvironment } from '../../../storage/types';

/**
 * Detect the current runtime environment
 * 
 * Determines whether the app is running in Tauri (desktop), web browser,
 * or build/SSR environment and adapts storage accordingly.
 * 
 * @returns The detected environment type
 */
export function detectEnvironment(): StorageEnvironment {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return 'build';
	}
	return detectTauri() ? 'tauri' : 'web';
}

/**
 * Get the journal storage path for display purposes
 * 
 * Returns a user-friendly representation of where journal files are stored.
 * In Tauri mode, this is typically ~/Documents/Diaryx/
 * 
 * @param environment - The current environment
 * @param journalFolder - The journal folder name
 * @returns Display path for journal storage location
 */
export function getJournalDisplayPath(
	environment: StorageEnvironment, 
	journalFolder: string
): string {
	if (environment === 'tauri') {
		// In Tauri, the journal folder is relative to the user's documents directory
		// We can't get the absolute path directly here without another Tauri API call
		// For now, return a user-friendly representation
		return `~/Documents/${journalFolder}/`;
	} else {
		return 'N/A (Web Browser)';
	}
}

/**
 * Check if we're in a build/SSR environment
 * 
 * @returns True if in build environment
 */
export function isBuildEnvironment(): boolean {
	return detectEnvironment() === 'build';
}

/**
 * Check if we're in Tauri environment
 * 
 * @returns True if in Tauri environment
 */
export function isTauriEnvironment(): boolean {
	return detectEnvironment() === 'tauri';
}

/**
 * Check if we're in web environment
 * 
 * @returns True if in web environment
 */
export function isWebEnvironment(): boolean {
	return detectEnvironment() === 'web';
}
