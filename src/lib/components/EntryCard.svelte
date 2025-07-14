<script lang="ts">
    import type { JournalEntryMetadata } from '../storage/index.ts';
    import { detectTauri } from '../utils/tauri.ts';

    interface Props {
        entry: JournalEntryMetadata;
        onselect?: (event: { id: string }) => void;
        ondelete?: (event: { id: string }) => void;
    }

    let { entry, onselect, ondelete }: Props = $props();

    // Check if entry content appears to be encrypted by looking at the preview
    let isEntryEncrypted = $derived(entry.preview.includes('🔒') && entry.preview.includes('encrypted'));
    
    // The preview is already handled by the storage layer
    let displayPreview = $derived(entry.preview);

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

    async function handleDelete(event: Event) {
        event.stopPropagation();
        
        let userConfirmed = false;
        
        // Detect platform and use appropriate dialog
        const isTauri = detectTauri();
        
        if (isTauri) {
            try {
                const { confirm } = await import('@tauri-apps/plugin-dialog');
                userConfirmed = await confirm(
                    `Are you sure you want to delete "${entry.title}"?`,
                    { title: 'Delete Entry', kind: 'warning' }
                );
            } catch (error) {
                console.error('Tauri dialog error:', error);
                userConfirmed = window.confirm(`Are you sure you want to delete "${entry.title}"?`);
            }
        } else {
            userConfirmed = window.confirm(`Are you sure you want to delete "${entry.title}"?`);
        }
        
        if (userConfirmed) {
            ondelete?.({ id: entry.id });
        }
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
            {#if isEntryEncrypted}
                <span class="encryption-indicator" title="This entry is encrypted">🔒</span>
            {/if}
            {entry.title}
        </h3>
        <button 
            class="delete-btn" 
            onclick={handleDelete}
            aria-label="Delete entry"
        >
            ✕
        </button>
    </div>
    
    <p class="entry-preview" class:encrypted={isEntryEncrypted}>{displayPreview}</p>
    
    <div class="entry-meta">
        <span class="entry-date">{formatDate(entry.modified_at)}</span>
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
        color: #f59e0b;
        margin-right: 0.5rem;
        font-size: 0.875rem;
    }

    .entry-preview.encrypted {
        color: var(--color-textSecondary, #6b7280);
        font-style: italic;
        opacity: 0.8;
    }
</style>
