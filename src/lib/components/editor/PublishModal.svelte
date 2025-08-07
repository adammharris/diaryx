<script lang="ts">
    import type { PublishModalProps } from './editor-types';
    import TagSelector from '../TagSelector.svelte';

    let { 
        isVisible, 
        entry, 
        entryId, 
        selectedTagIds = [], 
        frontmatterTags = [], 
        onTagSelectionChange, 
        onPublishWithTags, 
        onCancel 
    }: PublishModalProps = $props();

    function handleTagSelectionChange(tagIds: string[]) {
        onTagSelectionChange(tagIds);
    }

    function handlePublishWithTags() {
        onPublishWithTags();
    }

    function handleCancel() {
        onCancel();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            handleCancel();
        }
    }

    function handleOverlayClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            handleCancel();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isVisible}
    <div class="modal-overlay" onclick={handleOverlayClick} role="dialog" aria-modal="true" aria-labelledby="publish-modal-title">
        <div class="modal-content publish-modal">
            <div class="modal-header">
                <h3 id="publish-modal-title" class="modal-title">Share Entry</h3>
                <button 
                    class="close-btn"
                    onclick={handleCancel}
                    aria-label="Cancel publishing"
                    type="button"
                >
                    ×
                </button>
            </div>
            
            <div class="modal-body">
                <div class="publish-info">
                    <p class="publish-description">
                        Select tags to share this entry with other users. Anyone assigned to these tags will be able to read this entry.
                    </p>
                    
                    <div class="entry-preview">
                        <strong>Entry:</strong> {entry?.title || 'Untitled'}
                    </div>
                </div>
                
                <div class="tag-selector-container">
                    <TagSelector 
                        selectedTagIds={selectedTagIds}
                        onTagSelectionChange={handleTagSelectionChange}
                        disabled={false}
                        showCreateButton={true}
                        frontmatterTags={frontmatterTags}
                        entryId={entryId}
                    />
                </div>
                
                <div class="publish-actions">
                    <button 
                        class="btn btn-secondary"
                        onclick={handleCancel}
                        type="button"
                    >
                        Cancel
                    </button>
                    <button 
                        class="btn btn-primary"
                        onclick={handlePublishWithTags}
                        disabled={selectedTagIds.length === 0}
                        type="button"
                    >
                        {selectedTagIds.length === 0 ? 'Select tags to publish' : `Publish & Share`}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Publish Modal Styles */
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

    .publish-modal {
        max-width: 600px;
        width: 100%;
        max-height: 80vh;
        background: var(--color-surface);
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--color-background);
    }

    .modal-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
    }

    .modal-body {
        padding: 1.5rem;
        flex: 1;
        overflow-y: auto;
    }

    .publish-info {
        margin-bottom: 1.5rem;
    }

    .publish-description {
        margin: 0 0 1rem 0;
        color: var(--color-textSecondary);
        line-height: 1.5;
    }

    .entry-preview {
        padding: 0.75rem 1rem;
        background: var(--color-background);
        border-radius: 6px;
        border: 1px solid var(--color-border);
        color: var(--color-text);
    }

    .tag-selector-container {
        margin-bottom: 1.5rem;
    }

    .publish-actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border);
    }

    /* Mobile responsive for publish modal */
    @media (max-width: 768px) {
        .modal-overlay {
            padding: 0;
        }

        .publish-modal {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
        }

        .modal-header {
            padding: 1rem;
            padding-top: calc(1rem + env(safe-area-inset-top));
        }

        .publish-actions {
            flex-direction: column-reverse;
        }
    }
</style>