<script lang="ts">
    import type { JournalEntryMetadata } from '../storage/index.ts';
    import { passwordStore } from '../stores/password.js';
    import { metadataStore } from '../stores/metadata.js';
    import { isEncrypted } from '../utils/crypto.js';
    import { storage } from '../storage/index.js';

    interface Props {
        entry: JournalEntryMetadata;
        onselect?: (event: { id: string }) => void;
        ondelete?: (event: { id: string }) => void;
    }

    let { entry, onselect, ondelete }: Props = $props();

    // Get reactive metadata from the store - this will update when metadata changes
    let currentEntry = $derived(() => {
        const storeEntry = $metadataStore.entries[entry.id];
        // Use store entry if available, otherwise fall back to prop
        return storeEntry || entry;
    });

    // Check if entry has encrypted preview (locked state)
    let hasEncryptedPreview = $derived(() => {
        const currentMeta = currentEntry();
        return currentMeta.preview.includes('🔒') && currentMeta.preview.includes('encrypted');
    });
    
    // Check if we have a cached password for this entry
    let hasPassword = $derived(() => {
        const cache = $passwordStore.cache;
        const entryId = currentEntry().id;
        return cache[entryId] !== undefined;
    });
    
    // For web mode, check if content is encrypted when preview doesn't show encrypted state
    let contentEncryptionState = $state<'unknown' | 'encrypted' | 'unencrypted'>('unknown');
    
    // Effect to check content encryption when needed
    $effect(() => {
        const currentMeta = currentEntry();
        const needsContentCheck = !hasEncryptedPreview() && !hasPassword();
        
        if (needsContentCheck) {
            storage.getEntry(currentMeta.id).then(fullEntry => {
                if (fullEntry && isEncrypted(fullEntry.content)) {
                    contentEncryptionState = 'encrypted';
                    
                    // Update the metadata to show proper encrypted preview
                    const updatedMetadata = {
                        ...currentMeta,
                        preview: '🔒 This entry is encrypted and requires a password to view'
                    };
                    
                    // Update the metadata store to reflect the change
                    metadataStore.updateEntryMetadata(currentMeta.id, updatedMetadata);
                } else {
                    contentEncryptionState = 'unencrypted';
                }
            }).catch(() => {
                contentEncryptionState = 'unencrypted';
            });
        } else {
            contentEncryptionState = 'unknown';
        }
    });
    
    // Determine the encryption state for display
    let encryptionState = $derived(() => {
        if (hasEncryptedPreview()) {
            // Entry is locked (encrypted preview visible)
            return 'locked';
        } else if (hasPassword()) {
            // Entry has a cached password but no encrypted preview = unlocked
            return 'unlocked';
        } else if (contentEncryptionState === 'encrypted') {
            // Entry content is encrypted but no cached password = locked
            return 'locked';
        } else {
            // No encryption or still checking
            return 'none';
        }
    });
    
    // Display appropriate preview - use reactive metadata from store
    let displayPreview = $derived(currentEntry().preview);

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function handleSelect() {
        onselect?.({ id: entry.id });
    }

    function handleDelete(event: Event) {
        event.stopPropagation();
        ondelete?.({ id: entry.id });
    }
</script>

<div 
    class="entry-card" 
    onclick={handleSelect}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && handleSelect()}
>
    <div class="entry-header">
        <h3 class="entry-title">
            {#if encryptionState() === 'locked'}
                <span class="encryption-indicator locked" title="This entry is encrypted and locked">🔒</span>
            {:else if encryptionState() === 'unlocked'}
                <span class="encryption-indicator unlocked" title="This entry is encrypted but unlocked">🔓</span>
            {/if}
            {currentEntry().title}
        </h3>
        <button 
            class="delete-btn" 
            onclick={handleDelete}
            aria-label="Delete entry"
        >
            ✕
        </button>
    </div>
    
    <p class="entry-preview" class:encrypted={encryptionState() === 'locked'}>{displayPreview}</p>
    
    <div class="entry-meta">
        <span class="entry-date">{formatDate(currentEntry().modified_at)}</span>
    </div>
</div>

<style>
    .entry-card {
        background: var(--color-surface, white);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 0.75rem;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .entry-card:hover {
        border-color: var(--color-primary, #3b82f6);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transform: translateY(-1px);
    }

    .entry-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.5rem;
    }

    .entry-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text, #1f2937);
        margin: 0;
        line-height: 1.25;
        flex: 1;
        margin-right: 0.5rem;
    }

    .delete-btn {
        background: none;
        border: none;
        color: var(--color-textSecondary, #9ca3af);
        font-size: 1rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        opacity: 0;
        transition: all 0.2s ease;
        line-height: 1;
    }

    .entry-card:hover .delete-btn {
        opacity: 1;
    }

    .delete-btn:hover {
        background: #fee2e2;
        color: #dc2626;
    }

    .entry-preview {
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0 0 0.75rem 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .entry-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .entry-date {
        font-size: 0.75rem;
        color: var(--color-textSecondary, #9ca3af);
    }

    .encryption-indicator {
        margin-right: 0.5rem;
        font-size: 0.875rem;
    }
    
    .encryption-indicator.locked {
        color: #dc2626; /* Red for locked */
    }
    
    .encryption-indicator.unlocked {
        color: #16a34a; /* Green for unlocked */
    }

    .entry-preview.encrypted {
        color: var(--color-textSecondary, #6b7280);
        font-style: italic;
        opacity: 0.8;
    }
</style>
