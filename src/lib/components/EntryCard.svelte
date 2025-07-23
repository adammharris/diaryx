<script lang="ts">
    import type { JournalEntryMetadata } from '../storage/types.ts';
    import { metadataStore } from '../stores/metadata.js';
    import { e2eEncryptionService, e2eSessionStore } from '../services/e2e-encryption.service.js';

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

    // Get E2E encryption session state
    let e2eSession = $derived($e2eSessionStore);
    
    // Determine encryption state based on cached publish status
    let encryptionState = $derived(() => {
        const currentMeta = currentEntry();
        
        // Entry is locked if it's published AND E2E encryption exists but is not unlocked
        if (currentMeta.isPublished && e2eEncryptionService.hasStoredKeys() && !e2eSession?.isUnlocked) {
            return 'locked';
        }
        
        return 'none';
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
    class="bg-surface border rounded-lg p-3 mb-3 cursor-pointer transition-all duration-200 shadow-sm hover:border-primary hover:shadow-md hover:transform hover:-translate-y-px touch-manipulation" 
    onclick={handleSelect}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && handleSelect()}
>
    <div class="flex justify-between items-start mb-2">
        <h3 class="text-lg font-semibold text-left flex-1 leading-tight m-0">
            {currentEntry().title}
        </h3>
        <button 
            class="bg-transparent border-0 text-secondary p-1 rounded cursor-pointer opacity-0 hover:opacity-100 transition-all duration-200 hover:bg-red-100 hover:text-red-600" 
            onclick={handleDelete}
            aria-label="Delete entry"
        >
            ×
        </button>
    </div>
    
    <p class="text-secondary text-sm leading-relaxed mb-2 line-clamp-2 overflow-hidden" class:encrypted={encryptionState() === 'locked'}>{displayPreview}</p>
    
    <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
            {#if encryptionState() === 'locked'}
                <img src="/material-symbols--lock.svg" class="lock-icon locked" alt="Locked" title="Published entry - E2E encryption required to edit" />
            {/if}
            <span class="text-xs text-secondary">{formatDate(currentEntry().modified_at)}</span>
        </div>
    </div>
</div>

<style>
    /* Component-specific styles - EntryCard uses extracted utility classes */
    
    /* Line clamp for preview text */
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
    }
    
    /* Lock icon styling */
    .lock-icon {
        width: 12px;
        height: 12px;
        filter: invert(1) sepia(1) saturate(0) hue-rotate(0deg) brightness(0.5);
    }
    
    .lock-icon.locked {
        filter: invert(14%) sepia(95%) saturate(7462%) hue-rotate(7deg) brightness(92%) contrast(90%); /* Red for locked */
    }
    
    /* Encrypted preview styling */
    .encrypted {
        font-style: italic;
        opacity: 0.8;
    }
    
    /* Hover states - only on devices that support hover */
    @media (hover: hover) {
        .bg-surface:hover .opacity-0 {
            opacity: 1;
        }
    }
</style>
