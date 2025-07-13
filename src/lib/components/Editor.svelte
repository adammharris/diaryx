<script lang="ts">
    import { storage, type JournalEntry } from '../storage.js';
    import { createEventDispatcher } from 'svelte';
    import SvelteMarkdown from 'svelte-markdown';

    interface Props {
        entryId: string | null;
    }

    let { entryId }: Props = $props();

    const dispatch = createEventDispatcher<{
        close: {};
        saved: { id: string };
    }>();

    let entry: JournalEntry | null = $state(null);
    let content = $state('');
    let isPreview = $state(false);
    let isSaving = $state(false);
    let isLoading = $state(false);

    // Load entry when entryId changes
    $effect(() => {
        if (entryId) {
            loadEntry();
        } else {
            entry = null;
            content = '';
        }
    });

    async function loadEntry() {
        if (!entryId) return;
        
        isLoading = true;
        try {
            entry = await storage.getEntry(entryId);
            content = entry?.content || '';
        } catch (error) {
            console.error('Failed to load entry:', error);
        } finally {
            isLoading = false;
        }
    }

    async function handleSave() {
        if (!entry) return;
        
        isSaving = true;
        try {
            const success = await storage.saveEntry(entry.id, content);
            if (success) {
                dispatch('saved', { id: entry.id });
                // Update local entry
                entry.content = content;
                entry.modified_at = new Date().toISOString();
            } else {
                alert('Failed to save entry');
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save entry');
        } finally {
            isSaving = false;
        }
    }

    function handleClose() {
        dispatch('close', {});
    }

    function handleKeydown(event: KeyboardEvent) {
        // Cmd+S or Ctrl+S to save
        if ((event.metaKey || event.ctrlKey) && event.key === 's') {
            event.preventDefault();
            handleSave();
        }
        // Escape to close
        if (event.key === 'Escape') {
            handleClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if entry}
    <div class="editor-container">
        <div class="editor-header">
            <h2 class="editor-title">{entry.title}</h2>
            <div class="editor-controls">
                <button 
                    class="btn btn-secondary"
                    onclick={() => isPreview = !isPreview}
                >
                    {isPreview ? 'Edit' : 'Preview'}
                </button>
                <button 
                    class="btn btn-primary"
                    onclick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button 
                    class="btn btn-ghost"
                    onclick={handleClose}
                >
                    ✕
                </button>
            </div>
        </div>

        {#if isLoading}
            <div class="loading">Loading...</div>
        {:else if isPreview}
            <div class="preview-container">
                <SvelteMarkdown source={content} />
            </div>
        {:else}
            <textarea
                class="editor-textarea"
                bind:value={content}
                placeholder="Start writing your journal entry..."
                spellcheck="true"
            ></textarea>
        {/if}

        <div class="editor-status">
            <span class="word-count">
                {content.split(/\s+/).filter(w => w.length > 0).length} words
            </span>
            <span class="last-modified">
                Last modified: {new Date(entry.modified_at).toLocaleString()}
            </span>
        </div>
    </div>
{:else if entryId}
    <div class="loading">Loading entry...</div>
{:else}
    <div class="no-entry">
        <p>Select an entry to start editing</p>
    </div>
{/if}

<style>
    .editor-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        overflow: hidden;
    }

    .editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #e5e7eb;
        background: #f9fafb;
    }

    .editor-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
        margin: 0;
    }

    .editor-controls {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .btn {
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid transparent;
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

    .btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: white;
        color: #374151;
        border-color: #d1d5db;
    }

    .btn-secondary:hover {
        background: #f9fafb;
        border-color: #9ca3af;
    }

    .btn-ghost {
        background: transparent;
        color: #6b7280;
        padding: 0.5rem;
    }

    .btn-ghost:hover {
        background: #f3f4f6;
        color: #374151;
    }

    .editor-textarea {
        flex: 1;
        padding: 1.5rem;
        border: none;
        outline: none;
        resize: none;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: 0.9rem;
        line-height: 1.6;
        color: #374151;
    }

    .preview-container {
        flex: 1;
        padding: 1.5rem;
        overflow-y: auto;
        line-height: 1.6;
        color: #374151;
    }

    .preview-container :global(h1) {
        font-size: 1.875rem;
        font-weight: 700;
        margin-bottom: 1rem;
        color: #1f2937;
    }

    .preview-container :global(h2) {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 1.5rem 0 0.75rem;
        color: #1f2937;
    }

    .preview-container :global(h3) {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 1.25rem 0 0.5rem;
        color: #1f2937;
    }

    .preview-container :global(p) {
        margin-bottom: 1rem;
    }

    .preview-container :global(ul),
    .preview-container :global(ol) {
        margin-bottom: 1rem;
        padding-left: 1.5rem;
    }

    .preview-container :global(blockquote) {
        border-left: 4px solid #e5e7eb;
        padding-left: 1rem;
        margin: 1rem 0;
        color: #6b7280;
        font-style: italic;
    }

    .preview-container :global(code) {
        background: #f3f4f6;
        padding: 0.125rem 0.25rem;
        border-radius: 3px;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: 0.875em;
    }

    .preview-container :global(pre) {
        background: #f3f4f6;
        padding: 1rem;
        border-radius: 6px;
        overflow-x: auto;
        margin: 1rem 0;
    }

    .preview-container :global(pre code) {
        background: none;
        padding: 0;
    }

    .editor-status {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1.5rem;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
        font-size: 0.75rem;
        color: #6b7280;
    }

    .loading,
    .no-entry {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #6b7280;
        font-size: 1rem;
    }
</style>
