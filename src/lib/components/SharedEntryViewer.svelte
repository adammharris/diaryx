<script lang="ts">
    import SvelteMarkdown from 'svelte-markdown';
    import { e2eEncryptionService } from '../services/e2e-encryption.service.js';
    import type { JournalEntryMetadata } from '../storage/types.js';

    interface SharedEntry extends JournalEntryMetadata {
        author: string;
        tags: string[];
        fullContent?: string;
        authorPublicKey?: string;
        encryptionInfo?: {
            encrypted_title: string;
            encrypted_content: string;
            encryption_metadata: any;
            access_key: {
                encrypted_entry_key: string;
                key_nonce: string;
                granted_at: string;
            };
        };
    }

    interface Props {
        entry: SharedEntry | null;
        isVisible: boolean;
        onclose?: () => void;
    }

    let { entry, isVisible, onclose }: Props = $props();


    let displayContent = $derived.by(() => {
        if (!entry) return 'No content available';
        
        // Use full content if available (already decrypted), otherwise fallback to preview
        if (entry.fullContent) {
            return entry.fullContent;
        } else if (entry.preview && entry.preview !== 'Content is encrypted') {
            return entry.preview;
        } else {
            return 'Content is encrypted and could not be decrypted';
        }
    });


    function handleClose() {
        onclose?.();
    }

    function handleBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            handleClose();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            handleClose();
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isVisible && entry}
    <div class="modal-overlay" onclick={handleBackdropClick}>
        <div class="modal-content">
            <div class="modal-header">
                <div class="entry-header">
                    <h1 class="entry-title">{entry.title}</h1>
                    <div class="entry-meta">
                        <span class="author">Shared by: {entry.author}</span>
                        <span class="date">{formatDate(entry.modified_at)}</span>
                    </div>
                    {#if entry.tags && entry.tags.length > 0}
                        <div class="entry-tags">
                            {#each entry.tags as tag}
                                <span class="tag">#{tag}</span>
                            {/each}
                        </div>
                    {/if}
                </div>
                <div class="header-actions">
                    <button 
                        class="close-btn"
                        onclick={handleClose}
                        aria-label="Close entry viewer"
                    >
                        ×
                    </button>
                </div>
            </div>

            <div class="modal-body">
                <div class="content-area">
                    <div class="markdown-content">
                        <SvelteMarkdown source={displayContent} />
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}


<style>
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
    }

    .modal-content {
        background: var(--color-surface);
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        max-width: 900px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        background: var(--color-background);
    }

    .entry-header {
        flex: 1;
    }

    .entry-title {
        margin: 0 0 0.5rem 0;
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--color-text);
        line-height: 1.3;
    }

    .entry-meta {
        display: flex;
        gap: 1rem;
        margin-bottom: 0.75rem;
        font-size: 0.875rem;
        color: var(--color-textSecondary);
    }

    .author {
        font-style: italic;
    }

    .date {
        opacity: 0.8;
    }

    .entry-tags {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .tag {
        background: var(--color-primary);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .share-btn,
    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--color-textSecondary);
        padding: 0.5rem;
        line-height: 1;
        min-width: 40px;
        min-height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s;
    }

    .share-btn:hover,
    .close-btn:hover {
        background: var(--color-border);
        color: var(--color-text);
        transform: scale(1.05);
    }

    .share-btn {
        color: var(--color-primary);
    }

    .share-btn:hover {
        background: var(--color-primaryShadow);
        color: var(--color-primary);
    }

    .modal-body {
        padding: 1.5rem;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }


    .content-area {
        min-height: 300px;
    }

    .markdown-content {
        line-height: 1.6;
        color: var(--color-text);
    }

    .markdown-content :global(h1),
    .markdown-content :global(h2),
    .markdown-content :global(h3),
    .markdown-content :global(h4),
    .markdown-content :global(h5),
    .markdown-content :global(h6) {
        margin: 1.5rem 0 0.75rem 0;
        color: var(--color-text);
        font-weight: 600;
    }

    .markdown-content :global(h1) {
        font-size: 1.5rem;
    }

    .markdown-content :global(h2) {
        font-size: 1.25rem;
    }

    .markdown-content :global(h3) {
        font-size: 1.125rem;
    }

    .markdown-content :global(p) {
        margin: 0 0 1rem 0;
    }

    .markdown-content :global(ul),
    .markdown-content :global(ol) {
        margin: 0 0 1rem 0;
        padding-left: 1.5rem;
    }

    .markdown-content :global(li) {
        margin: 0.25rem 0;
    }

    .markdown-content :global(blockquote) {
        margin: 1rem 0;
        padding: 0.5rem 1rem;
        border-left: 4px solid var(--color-primary);
        background: var(--color-background);
        font-style: italic;
    }

    .markdown-content :global(code) {
        background: var(--color-background);
        padding: 0.125rem 0.25rem;
        border-radius: 3px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 0.875em;
    }

    .markdown-content :global(pre) {
        background: var(--color-background);
        padding: 1rem;
        border-radius: 6px;
        overflow-x: auto;
        margin: 1rem 0;
    }

    .markdown-content :global(pre code) {
        background: none;
        padding: 0;
    }


    /* Mobile responsive */
    @media (max-width: 768px) {
        .modal-overlay {
            padding: 0;
        }

        .modal-content {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
        }

        .modal-header {
            padding: 1rem;
            padding-top: calc(1rem + env(safe-area-inset-top));
        }

        .entry-title {
            font-size: 1.5rem;
        }

        .entry-meta {
            flex-direction: column;
            gap: 0.5rem;
        }
    }
</style>