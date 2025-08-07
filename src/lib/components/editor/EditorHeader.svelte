<script lang="ts">
    import type { EditorHeaderProps } from './editor-types';

    let { 
        entry, 
        editableTitle, 
        isEditingTitle, 
        isEntryLocked, 
        canPublish, 
        isPublished, 
        isMobile,
        onTitleEdit,
        onTitleSave,
        onTitleCancel,
        onTitleKeydown,
        onClose,
        onTogglePublish,
        onShowInfo,
        onTogglePreview,
        isPreview
    }: EditorHeaderProps = $props();

    function handleTitleClick() {
        if (!isEntryLocked) {
            onTitleEdit();
        }
    }

    function handleTitleKeydown(event: KeyboardEvent) {
        onTitleKeydown(event);
    }

    function handleTitleBlur() {
        if (isEditingTitle) {
            onTitleSave();
        }
    }

    function handleClose() {
        onClose();
    }

    function handleTogglePublish() {
        if (canPublish) {
            onTogglePublish();
        }
    }

    function handleShowInfo() {
        onShowInfo();
    }

    function handleTogglePreview() {
        if (!isEntryLocked) {
            onTogglePreview();
        }
    }

    // Title display logic
    let displayTitle = $derived.by(() => {
        if (isEditingTitle) {
            return editableTitle;
        }
        return entry?.title || 'Untitled';
    });

    // Button states
    let publishButtonTitle = $derived.by(() => {
        if (isPublished) return 'Published - Click to unpublish';
        if (canPublish) return 'Draft - Click to publish';
        return 'Sign in and unlock encryption to publish';
    });

    let previewButtonTitle = $derived.by(() => {
        if (isEntryLocked) return 'Unlock entry to preview';
        return isPreview ? 'Switch to edit mode' : 'Switch to preview mode';
    });
</script>

<div class="editor-header">
    <div class="title-section">
        {#if isEditingTitle}
            <input 
                class="title-input"
                bind:value={editableTitle}
                onkeydown={handleTitleKeydown}
                onblur={handleTitleBlur}
                placeholder="Enter title..."
                disabled={isEntryLocked}
                autofocus
            />
        {:else}
            <button 
                class="title-button"
                onclick={handleTitleClick}
                title={isEntryLocked ? 'Unlock entry to edit title' : 'Click to edit title'}
                type="button"
                disabled={isEntryLocked}
            >
                {displayTitle}
            </button>
        {/if}
        
        <button 
            class="close-btn"
            onclick={handleClose}
            title={isMobile ? 'Back to entries' : 'Close'}
            type="button"
        >
            {#if isMobile}
                ← Back
            {:else}
                ×
            {/if}
        </button>
    </div>

    <div class="actions-section">
        {#if isEntryLocked}
            <button 
                class="btn btn-unlock"
                onclick={onShowInfo}
                title="Entry is encrypted - view info for details"
                type="button"
            >
                <img src="/material-symbols--lock.svg" class="icon" alt="Locked" />
                Unlock
            </button>
        {:else}
            <button 
                class="btn btn-publish"
                class:published={isPublished}
                onclick={handleTogglePublish}
                title={publishButtonTitle}
                disabled={!canPublish}
                type="button"
            >
                {#if isPublished}
                    <img src="/material-symbols--public.svg" class="icon" alt="Published" />
                {:else}
                    <img src="/material-symbols--draft.svg" class="icon" alt="Draft" />
                {/if}
            </button>
        {/if}

        <button 
            class="btn btn-info"
            onclick={handleShowInfo}
            title="Entry information and metadata"
            type="button"
        >
            <img src="/material-symbols--info.svg" class="icon" alt="Info" />
        </button>

        <button 
            class="btn btn-secondary"
            onclick={handleTogglePreview}
            disabled={isEntryLocked}
            title={previewButtonTitle}
            type="button"
        >
            {isPreview ? 'Edit' : 'Preview'}
        </button>
    </div>
</div>

<style>
    .editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-background);
        gap: 1rem;
        min-height: 80px;
    }

    .title-section {
        display: flex;
        align-items: center;
        flex: 1;
        gap: 1rem;
    }

    .title-input {
        flex: 1;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
        background: var(--color-surface);
        border: 2px solid var(--color-border);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        outline: none;
        transition: border-color 0.2s;
    }

    .title-input:focus {
        border-color: var(--color-primary, #3b82f6);
    }

    .title-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .title-button {
        flex: 1;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
        background: transparent;
        border: none;
        padding: 0.5rem;
        margin: 0;
        font-family: inherit;
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.2s;
        text-align: left;
        min-height: 2.5rem;
        display: flex;
        align-items: center;
    }

    .title-button:hover:not(:disabled) {
        background: var(--color-surface);
    }

    .title-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .close-btn {
        background: transparent;
        border: none;
        font-size: 1.5rem;
        font-weight: 300;
        color: var(--color-textSecondary);
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        transition: background-color 0.2s;
        line-height: 1;
    }

    .close-btn:hover {
        background: var(--color-surface);
        color: var(--color-text);
    }

    .actions-section {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-shrink: 0;
    }

    .btn .icon {
        width: 14px;
        height: 14px;
        filter: var(--color-icon-filter);
    }

    .btn-publish.published .icon {
        filter: brightness(0) invert(1);
    }

    .btn-unlock .icon {
        filter: var(--color-icon-filter);
    }

    /* Mobile responsive adjustments */
    @media (max-width: 768px) {
        .editor-header {
            padding: 0.75rem 1rem;
            padding-top: calc(0.75rem + env(safe-area-inset-top));
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            flex-direction: column;
            gap: 0.75rem;
            min-height: auto;
        }

        .title-section {
            width: 100%;
            order: 1;
        }

        .actions-section {
            width: 100%;
            justify-content: flex-end;
            order: 2;
        }

        .title-input,
        .title-button {
            font-size: 1.125rem;
        }

        .close-btn {
            font-size: 1rem;
            padding: 0.5rem;
        }
    }

    /* Very small screens */
    @media (max-width: 480px) {
        .actions-section {
            flex-wrap: wrap;
            justify-content: center;
            gap: 0.375rem;
        }

        .btn {
            font-size: 0.875rem;
            padding: 0.375rem 0.75rem;
        }
    }
</style>