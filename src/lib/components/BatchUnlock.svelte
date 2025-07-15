<script lang="ts">
  import { passwordStore } from '../stores/password.js';
  import { storage } from '../storage/index.js';
  import type { JournalEntry } from '../storage/index.js';

  interface Props {
    isVisible: boolean;
    onclose: () => void;
    onunlock?: (unlockedCount: number) => void;
  }

  let { isVisible, onclose, onunlock }: Props = $props();

  let password = $state('');
  let isUnlocking = $state(false);
  let unlockResult = $state<{
    successCount: number;
    totalAttempted: number;
    unlockedEntries: string[];
  } | null>(null);

  // Reset state when modal becomes visible
  $effect(() => {
    if (isVisible) {
      password = '';
      isUnlocking = false;
      unlockResult = null;
      // Focus the password input after a short delay
      setTimeout(() => {
        const input = document.querySelector('.batch-password-input') as HTMLInputElement;
        input?.focus();
      }, 100);
    }
  });

  async function handleBatchUnlock() {
    if (!password.trim() || isUnlocking) return;
    
    isUnlocking = true;
    try {
      // Get all entries
      const entries = await storage.getAllEntries();
      
      // Get the actual entry content for encrypted entries
      const encryptedEntries: JournalEntry[] = [];
      for (const meta of entries) {
        // Only include entries that appear to be encrypted and aren't already unlocked
        if (meta.preview.includes('🔒') && meta.preview.includes('encrypted') && !passwordStore.hasCachedPassword(meta.id)) {
          const entry = await storage.getEntry(meta.id);
          if (entry) {
            encryptedEntries.push(entry);
          }
        }
      }

      if (encryptedEntries.length === 0) {
        unlockResult = {
          successCount: 0,
          totalAttempted: 0,
          unlockedEntries: []
        };
        return;
      }

      // Attempt batch unlock
      const result = await passwordStore.batchUnlock(password, encryptedEntries);
      
      unlockResult = {
        successCount: result.successCount,
        totalAttempted: encryptedEntries.length,
        unlockedEntries: result.unlockedEntries
      };

      // Notify parent component
      if (result.successCount > 0) {
        onunlock?.(result.successCount);
      }

      // Auto-close if we unlocked everything
      if (result.successCount === encryptedEntries.length) {
        setTimeout(() => {
          onclose();
        }, 1500);
      }
    } catch (error) {
      console.error('Batch unlock error:', error);
    } finally {
      isUnlocking = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleBatchUnlock();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onclose();
    }
  }
</script>

{#if isVisible}
  <div 
    class="modal-overlay" 
    onclick={onclose}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
    role="presentation"
  >
    <div 
      class="modal-content" 
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-unlock-title"
      tabindex="-1"
    >
      <div class="modal-header">
        <h3 class="modal-title" id="batch-unlock-title">🔓 Batch Unlock</h3>
        <button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
      </div>

      <div class="modal-body">
        <p class="unlock-description">
          Enter a password to unlock all entries that use this password.
        </p>

        <div class="password-field">
          <input
            type="password"
            bind:value={password}
            onkeydown={handleKeydown}
            placeholder="Enter password..."
            class="batch-password-input"
            disabled={isUnlocking}
          />
        </div>

        {#if unlockResult}
          <div class="unlock-result">
            {#if unlockResult.successCount > 0}
              <div class="success-message">
                ✅ Successfully unlocked {unlockResult.successCount} out of {unlockResult.totalAttempted} encrypted entries!
              </div>
            {:else if unlockResult.totalAttempted > 0}
              <div class="error-message">
                ❌ Password didn't match any of the {unlockResult.totalAttempted} encrypted entries.
              </div>
            {:else}
              <div class="info-message">
                ℹ️ No locked encrypted entries found.
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button 
          class="btn btn-secondary" 
          onclick={onclose}
          disabled={isUnlocking}
        >
          {unlockResult?.successCount ? 'Done' : 'Cancel'}
        </button>
        <button 
          class="btn btn-primary" 
          onclick={handleBatchUnlock}
          disabled={!password.trim() || isUnlocking}
        >
          {isUnlocking ? 'Unlocking...' : 'Unlock All'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .modal-content {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    width: 90%;
    max-width: 450px;
    max-height: 90vh;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .modal-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
  }

  .close-btn {
    background: none;
    border: none;
    color: #6b7280;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .modal-body {
    padding: 1.5rem;
  }

  .unlock-description {
    margin: 0 0 1rem 0;
    color: #374151;
    line-height: 1.5;
  }

  .password-field {
    margin-bottom: 1rem;
  }

  .batch-password-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s ease;
    box-sizing: border-box;
  }

  .batch-password-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .batch-password-input:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
  }

  .unlock-result {
    margin-top: 1rem;
  }

  .success-message {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #15803d;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .error-message {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .info-message {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    outline: none;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: white;
    color: #374151;
    border-color: #d1d5db;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
    border-color: #2563eb;
  }

  .btn-primary:focus {
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
</style>