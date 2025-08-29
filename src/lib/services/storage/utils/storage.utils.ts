/**
 * Storage Utility Functions
 * 
 * Provides utility functions for filename generation, title conversion,
 * validation, and other storage-related operations.
 */

import { exists, BaseDirectory } from '@tauri-apps/plugin-fs';
import type { JournalEntry } from '../../../storage/types';

/**
 * Storage configuration constants
 */
export const STORAGE_CONFIG = {
	fileExtension: '.md',
	journalFolder: 'Diaryx',
	baseDir: BaseDirectory.Document,
	maxFilenameLength: 50,
	dbName: 'diaryx-journal',
	dbVersion: 2
} as const;

/**
 * Convert a title to a safe filename
 * 
 * Removes special characters, converts to lowercase, and limits length
 * for use as a filesystem-safe filename.
 * 
 * @param title - The title to convert
 * @returns Safe filename string
 */
export function titleToSafeFilename(title: string): string {
	return title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, STORAGE_CONFIG.maxFilenameLength);
}

/**
 * Generate a unique filename by appending counter if needed
 * 
 * @param baseTitle - The base title to convert
 * @param fileExistsChecker - Function to check if file exists
 * @returns Promise resolving to unique filename
 */
export async function generateUniqueFilename(
	baseTitle: string,
	fileExistsChecker: (filename: string) => Promise<boolean>
): Promise<string> {
	const safeTitle = titleToSafeFilename(baseTitle);
	let filename = safeTitle;
	let counter = 1;
	
	while (await fileExistsChecker(filename)) {
		filename = `${safeTitle}-${counter}`;
		counter++;
	}
	
	return filename;
}

/**
 * Create a display title from a filename ID
 * 
 * Converts kebab-case or snake_case filenames back to readable titles
 * 
 * @param id - The filename ID to convert
 * @returns Readable title string
 */
export function createTitleFromId(id: string): string {
	return id
		.replace(/[-_]/g, ' ')
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Check if a file exists by filename in Tauri environment
 * 
 * @param filename - The filename to check (without extension)
 * @returns Promise resolving to true if file exists
 */
export async function fileExistsByFilename(filename: string): Promise<boolean> {
	const filePath = `${STORAGE_CONFIG.journalFolder}/${filename}${STORAGE_CONFIG.fileExtension}`;
	return await exists(filePath, { baseDir: STORAGE_CONFIG.baseDir });
}

/**
 * Validate Base64 encoded string
 * 
 * @param str - String to validate
 * @returns True if valid Base64
 */
export function isValidBase64(str: string): boolean {
	const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
	return base64Regex.test(str);
}

/**
 * Validate encrypted data integrity
 * 
 * Checks that all required fields are present and contain valid data
 * 
 * @param encryptedData - The encrypted data object to validate
 * @returns True if data is valid
 */
export function validateEncryptedData(encryptedData: {
	encryptedContentB64: string;
	contentNonceB64: string;
	encryptedEntryKeyB64: string;
	keyNonceB64: string;
}): boolean {
	try {
		// Check that all required fields are present and are valid Base64
		if (!encryptedData.encryptedContentB64 || !encryptedData.contentNonceB64 ||
			!encryptedData.encryptedEntryKeyB64 || !encryptedData.keyNonceB64) {
			console.error('Missing required encrypted data fields');
			return false;
		}

		// Validate Base64 format
		const fields = [
			encryptedData.encryptedContentB64,
			encryptedData.contentNonceB64,
			encryptedData.encryptedEntryKeyB64,
			encryptedData.keyNonceB64
		];

		for (const field of fields) {
			if (!isValidBase64(field)) {
				console.error('Invalid Base64 format detected');
				return false;
			}
		}

		// Check minimum lengths for security
		if (encryptedData.contentNonceB64.length < 16 || // Minimum 12 bytes encoded
			encryptedData.keyNonceB64.length < 16 ||
			encryptedData.encryptedContentB64.length < 20 || // Some minimum content
			encryptedData.encryptedEntryKeyB64.length < 40) { // Minimum key size
			console.error('Encrypted data fields too short');
			return false;
		}

		return true;
	} catch (error) {
		console.error('Error validating encrypted data:', error);
		return false;
	}
}

/**
 * Create default entries for web environment
 * 
 * @returns Array of default journal entries
 */
export function createDefaultWebEntries(): JournalEntry[] {
	const welcomeEntry: JournalEntry = {
		id: '2025-01-01_welcome',
		title: 'Welcome to Diaryx!',
		content: `# Welcome to Diaryx!

Welcome to your personal journal! This is a demo entry to show you how the app works.

## Features in Web Mode:

- ✅ **Create and edit entries** - Click the + button or type a title above
- ✅ **Markdown support** - Use # for headings, **bold**, *italic*, and more
- ✅ **Search functionality** - Find your entries quickly
- ✅ **Beautiful themes** - Click the ⚙️ settings button to try different colors
- ✅ **Local storage** - Your entries are saved in your browser's IndexedDB
- ✅ **Preview mode** - Toggle between edit and preview when writing
- ✅ **Encryption** - Protect your entries with passwords 🔒

## Try it out:

1. Create a new entry by typing a title above
2. Click on this entry to edit it
3. Try the different color themes in settings
4. Search for entries using the search box
5. Enable encryption by clicking the 🔒 button in the editor

Your entries will persist between browser sessions, so feel free to use this as your actual journal!

Happy writing! 📝`,
		created_at: '2025-01-01T10:00:00.000Z',
		modified_at: '2025-01-01T10:00:00.000Z',
		file_path: 'web-entry-welcome.md'
	};

	const demoEntry: JournalEntry = {
		id: '2025-01-02_demo-features',
		title: 'Demo: Markdown Features',
		content: `# Demo: Markdown Features

This entry demonstrates various markdown features you can use in your journal.

## Headers

You can use different levels of headers:

### Level 3 Header
#### Level 4 Header

## Text Formatting

**Bold text** and *italic text* make your entries more expressive.

You can also use ~~strikethrough~~ and \`inline code\`.

## Lists

### Unordered Lists:
- Morning coffee ☕
- Writing in journal
- Planning the day
- Exercise routine

### Ordered Lists:
1. Wake up early
2. Meditation
3. Journal writing
4. Breakfast

## Quotes

> "The journal is a vehicle for my sense of selfhood. It represents me as emotionally and spiritually independent."
> 
> — Anaïs Nin

## Code Blocks

\`\`\`javascript
function writeJournal(thoughts) {
    return \`Today I think: \${thoughts}\`;
}
\`\`\`

## Links and More

You can also add links: [Markdown Guide](https://www.markdownguide.org/)

Try editing this entry to experiment with markdown!`,
		created_at: '2025-01-02T14:30:00.000Z',
		modified_at: '2025-01-02T14:30:00.000Z',
		file_path: 'web-entry-demo.md'
	};

	return [welcomeEntry, demoEntry];
}

/**
 * Get file path for entry in Tauri environment
 * 
 * @param id - Entry ID
 * @returns Full file path for the entry
 */
export function getEntryFilePath(id: string): string {
	return `${STORAGE_CONFIG.journalFolder}/${id}${STORAGE_CONFIG.fileExtension}`;
}

/**
 * Extract entry ID from filename
 * 
 * @param filename - Full filename with extension
 * @returns Entry ID without extension
 */
export function extractIdFromFilename(filename: string): string {
	return filename.replace(STORAGE_CONFIG.fileExtension, '');
}

/**
 * Check if filename has the correct extension
 * 
 * @param filename - Filename to check
 * @returns True if filename ends with the correct extension
 */
export function hasCorrectExtension(filename: string): boolean {
	return filename.endsWith(STORAGE_CONFIG.fileExtension);
}
