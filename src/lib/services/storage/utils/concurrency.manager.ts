/**
 * Concurrency Manager for Storage Operations
 * 
 * Manages locks for cloud operations and sync progress tracking
 * to prevent race conditions and data corruption.
 */

/**
 * Manages concurrency control for storage operations
 */
export class ConcurrencyManager {
	private operationLocks = new Map<string, Promise<any>>();
	private syncInProgress = false;

	/**
	 * Acquire a lock for cloud operations on a specific entry
	 * 
	 * Ensures only one cloud operation per entry runs at a time to prevent
	 * race conditions and data corruption.
	 * 
	 * @template T
	 * @param entryId - Entry identifier
	 * @param operation - Async operation to execute with lock
	 * @returns Promise resolving to the result of the operation
	 */
	async acquireCloudLock<T>(entryId: string, operation: () => Promise<T>): Promise<T> {
		const lockKey = `cloud_${entryId}`;
		
		// If there's already an operation in progress for this entry, wait for it
		if (this.operationLocks.has(lockKey)) {
			await this.operationLocks.get(lockKey);
		}

		// Create a new lock for this operation
		const operationPromise = operation();
		this.operationLocks.set(lockKey, operationPromise);

		try {
			const result = await operationPromise;
			return result;
		} finally {
			this.operationLocks.delete(lockKey);
		}
	}

	/**
	 * Set sync progress status
	 * 
	 * @param inProgress - Whether sync is currently in progress
	 */
	setSyncInProgress(inProgress: boolean): void {
		this.syncInProgress = inProgress;
	}

	/**
	 * Check if sync is currently in progress
	 * 
	 * @returns True if sync is in progress
	 */
	isSyncInProgress(): boolean {
		return this.syncInProgress;
	}

	/**
	 * Get current sync status
	 * 
	 * Returns information about ongoing synchronization operations.
	 * 
	 * @returns Sync status with inProgress flag and active operations
	 */
	getSyncStatus(): { inProgress: boolean; activeOperations: string[] } {
		return {
			inProgress: this.syncInProgress,
			activeOperations: Array.from(this.operationLocks.keys())
		};
	}

	/**
	 * Cancel all ongoing sync operations
	 * 
	 * Clears all operation locks and resets sync progress.
	 * Note: This doesn't actually cancel running operations,
	 * it just clears the tracking.
	 */
	cancelSyncOperations(): void {
		this.operationLocks.clear();
		this.syncInProgress = false;
		console.log('All sync operations cancelled');
	}

	/**
	 * Wait for a specific operation to complete
	 * 
	 * @param lockKey - The lock key to wait for
	 * @returns Promise that resolves when the operation completes
	 */
	async waitForOperation(lockKey: string): Promise<void> {
		const operation = this.operationLocks.get(lockKey);
		if (operation) {
			try {
				await operation;
			} catch (error) {
				// Operation failed, but we still waited for it to complete
				console.warn(`Waited operation ${lockKey} failed:`, error);
			}
		}
	}

	/**
	 * Get count of active operations
	 * 
	 * @returns Number of currently active operations
	 */
	getActiveOperationCount(): number {
		return this.operationLocks.size;
	}

	/**
	 * Check if a specific operation is active
	 * 
	 * @param lockKey - The lock key to check
	 * @returns True if the operation is currently active
	 */
	isOperationActive(lockKey: string): boolean {
		return this.operationLocks.has(lockKey);
	}
}

// Export a singleton instance for use across the application
export const concurrencyManager = new ConcurrencyManager();
