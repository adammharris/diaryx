<script lang="ts">
    import { storage, type JournalEntry } from '../storage/index';
    import SvelteMarkdown from 'svelte-markdown';
    import { passwordStore } from '../stores/password.js';
    import { isEncrypted, encrypt } from '../utils/crypto.js';

    interface Props {
        entryId: string | null;
        onclose?: () => void;
        onsaved?: (data: { id: string }) => void;
        onrenamed?: (data: { oldId: string; newId: string }) => void;
        onencryptiontoggle?: (data: { entryId: string; enable: boolean }) => void;
        onerror?: (data: { title: string; message: string }) => void;
    }

    let { entryId, onclose, onsaved, onrenamed, onencryptiontoggle, onerror }: Props = $props();


    let entry: JournalEntry | null = $state(null);
    let content = $state('');
    let editableTitle = $state('');
    let isEditingTitle = $state(false);
    let isPreview = $state(false);
    let isSaving = $state(false);
    let isLoading = $state(false);
    let isEncryptionEnabled = $state(false);

    // Load entry when entryId changes
    $effect(() => {
        if (entryId) {
            loadEntry();
        } else {
            entry = null;
            content = '';
            editableTitle = '';
            isEncryptionEnabled = false;
        }
    });

    async function loadEntry() {
        if (!entryId) return;
        
        isLoading = true;
        
        try {
            const rawEntry = await storage.getEntry(entryId);
            if (!rawEntry) return;

            entry = rawEntry;
            editableTitle = rawEntry.title;
            
            // Check if entry is encrypted
            if (isEncrypted(rawEntry.content)) {
                isEncryptionEnabled = true;
                
                // Try to decrypt with cached password
                const decryptedEntry = await passwordStore.tryDecryptWithCache(rawEntry);
                
                if (decryptedEntry) {
                    // Successfully decrypted with cached password
                    content = decryptedEntry.content;
                } else {
                    // If we reach here, it means the main page should have handled password prompting
                    // but somehow didn't. This shouldn't happen in normal flow.
                    console.error('Editor received encrypted entry without cached password - this should not happen');
                    onerror?.({
                        title: 'Decryption Error',
                        message: 'Unable to decrypt entry. Please try selecting it again.'
                    });
                    return;
                }
            } else {
                // Entry is not encrypted
                isEncryptionEnabled = false;
                content = rawEntry.content;
            }
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
            let contentToSave = content;
            
            // If encryption is enabled, encrypt the content before saving
            if (isEncryptionEnabled && entryId) {
                // Get the cached password for this entry
                const { cache } = $passwordStore;
                const passwordData = cache[entryId];
                
                if (passwordData) {
                    contentToSave = await encrypt(content, passwordData.password);
                } else {
                    onerror?.({
                        title: 'Password Required',
                        message: 'Cannot save encrypted entry without password. Please decrypt the entry first.'
                    });
                    return;
                }
            }
            
            const success = await storage.saveEntry(entry.id, contentToSave);
            if (success) {
                onsaved?.({ id: entry.id });
                // Update local entry with the original content (not encrypted)
                entry.content = contentToSave;
                entry.modified_at = new Date().toISOString();
            } else {
                onerror?.({
                    title: 'Save Failed',
                    message: 'Failed to save entry. Please try again.'
                });
            }
        } catch (error) {
            console.error('Save error:', error);
            onerror?.({
                title: 'Save Failed',
                message: 'Failed to save entry. Please try again.'
            });
        } finally {
            isSaving = false;
        }
    }

    function handleClose() {
        onclose?.();
    }

    async function handleTitleSave() {
        if (!entry || !entryId || !editableTitle.trim()) {
            isEditingTitle = false;
            return;
        }

        // If title hasn't changed, just stop editing
        if (editableTitle.trim() === entry.title) {
            isEditingTitle = false;
            return;
        }

        try {
            const newId = await storage.renameEntry(entryId, editableTitle.trim());
            if (newId) {
                onrenamed?.({ oldId: entryId, newId });
                isEditingTitle = false;
            } else {
                onerror?.({
                    title: 'Rename Failed',
                    message: 'Failed to rename entry. Please try again.'
                });
                editableTitle = entry.title; // Reset to original title
                isEditingTitle = false;
            }
        } catch (error) {
            console.error('Rename error:', error);
            onerror?.({
                title: 'Rename Failed',
                message: 'Failed to rename entry. Please try again.'
            });
            editableTitle = entry.title; // Reset to original title
            isEditingTitle = false;
        }
    }

    function handleTitleCancel() {
        editableTitle = entry?.title || '';
        isEditingTitle = false;
    }

    function handleTitleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleTitleSave();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            handleTitleCancel();
        }
    }



    function toggleEncryption() {
        if (!entry || !entryId) return;
        
        if (!isEncryptionEnabled) {
            // Enabling encryption - delegate to main page
            onencryptiontoggle?.({ entryId, enable: true });
        } else {
            // Disabling encryption - clear password and convert to plain text
            isEncryptionEnabled = false;
            passwordStore.clearPassword(entryId);
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        // Handle keyboard shortcuts
        
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
            {#if isEditingTitle}
                <input 
                    class="editor-title-input"
                    bind:value={editableTitle}
                    onkeydown={handleTitleKeydown}
                    onblur={handleTitleSave}
                    autofocus
                />
            {:else}
                <h2 
                    class="editor-title"
                    onclick={() => isEditingTitle = true}
                    title="Click to edit title"
                >
                    {entry.title}
                </h2>
            {/if}
            <div class="editor-controls">
                <button 
                    class="btn btn-encryption"
                    class:enabled={isEncryptionEnabled}
                    onclick={toggleEncryption}
                    title={isEncryptionEnabled ? 'Encryption enabled' : 'Enable encryption'}
                >
                    {isEncryptionEnabled ? '🔒' : '🔓'}
                </button>
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
            <span class="encryption-status">
                {#if isEncryptionEnabled}
                    🔒 Encrypted
                {:else}
                    📝 Plain text
                {/if}
            </span>
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
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        transition: background-color 0.2s ease;
    }

    .editor-title:hover {
        background-color: #f3f4f6;
    }

    .editor-title-input {
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
        margin: 0;
        padding: 0.25rem 0.5rem;
        border: 2px solid #3b82f6;
        border-radius: 4px;
        background: white;
        outline: none;
        flex: 1;
        margin-right: 0.5rem;
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

    .btn-encryption {
        background: #f3f4f6;
        color: #6b7280;
        border-color: #d1d5db;
        transition: all 0.2s ease;
    }

    .btn-encryption:hover {
        background: #e5e7eb;
        color: #374151;
    }

    .btn-encryption.enabled {
        background: #fef3c7;
        color: #d97706;
        border-color: #fcd34d;
    }

    .btn-encryption.enabled:hover {
        background: #fde68a;
        border-color: #f59e0b;
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
        gap: 1rem;
    }

    .encryption-status {
        font-weight: 500;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #f3f4f6;
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
