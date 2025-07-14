<script lang="ts">
    import { storage, type JournalEntry } from '../storage/index.ts';
    import { createEventDispatcher } from 'svelte';
    import SvelteMarkdown from 'svelte-markdown';
    import PasswordPrompt from './PasswordPrompt.svelte';
    import { passwordStore } from '../stores/password.js';
    import { isEncrypted, decrypt, encrypt } from '../utils/crypto.js';

    interface Props {
        entryId: string | null;
    }

    let { entryId }: Props = $props();

    const dispatch = createEventDispatcher<{
        close: {};
        saved: { id: string };
        decrypted: { id: string };
    }>();

    let entry: JournalEntry | null = $state(null);
    let content = $state('');
    let isPreview = $state(false);
    let isSaving = $state(false);
    let isLoading = $state(false);
    let needsPassword = $state(false);
    let isEncryptionEnabled = $state(false);

    // Load entry when entryId changes
    $effect(() => {
        if (entryId) {
            loadEntry();
        } else {
            entry = null;
            content = '';
            needsPassword = false;
            isEncryptionEnabled = false;
        }
    });

    async function loadEntry() {
        if (!entryId) return;
        
        isLoading = true;
        needsPassword = false;
        
        try {
            const rawEntry = await storage.getEntry(entryId);
            if (!rawEntry) return;

            entry = rawEntry;
            
            // Check if entry is encrypted
            if (isEncrypted(rawEntry.content)) {
                isEncryptionEnabled = true;
                
                // Try to decrypt with cached password first
                const decryptedEntry = await passwordStore.tryDecryptWithCache(rawEntry);
                
                if (decryptedEntry) {
                    // Successfully decrypted with cached password
                    content = decryptedEntry.content;
                    
                    // Update title from decrypted content
                    const firstLine = decryptedEntry.content.split('\n')[0];
                    if (firstLine.startsWith('#')) {
                        entry.title = firstLine.replace(/^#+\s*/, '').trim();
                    }
                } else {
                    // Need password from user
                    content = '';
                    needsPassword = true;
                    passwordStore.startPrompting(entryId);
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
                const password = cache[entryId];
                
                if (password) {
                    contentToSave = await encrypt(content, password);
                } else {
                    alert('Cannot save encrypted entry without password');
                    return;
                }
            }
            
            const success = await storage.saveEntry(entry.id, contentToSave);
            if (success) {
                dispatch('saved', { id: entry.id });
                // Update local entry with the original content (not encrypted)
                entry.content = contentToSave;
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

    async function handlePasswordSubmit(event: CustomEvent<{ password: string }>) {
        if (!entry || !entryId) return;
        
        const { password } = event.detail;
        
        try {
            if (isEncrypted(entry.content)) {
                // Existing encrypted entry - try to decrypt
                const decryptedContent = await decrypt(entry.content, password);
                content = decryptedContent;
                
                // Extract proper title from decrypted content
                const firstLine = decryptedContent.split('\n')[0];
                if (firstLine.startsWith('#')) {
                    entry.title = firstLine.replace(/^#+\s*/, '').trim();
                }
            } else {
                // Plain text entry being encrypted - just cache the password
                // Content stays the same for now, will be encrypted on save
            }
            
            // Success! Cache the password
            passwordStore.cachePassword(entryId, password);
            needsPassword = false;
            passwordStore.endPrompting();
            
            // Update metadata cache with proper title and notify parent
            if (isEncrypted(entry.content)) {
                await storage.updateDecryptedTitle(entryId, content);
                dispatch('decrypted', { id: entryId });
            }
        } catch (error) {
            // Password is incorrect (only relevant for existing encrypted entries)
            passwordStore.handleFailedAttempt();
        }
    }

    function handlePasswordCancel() {
        needsPassword = false;
        passwordStore.endPrompting();
        
        // If we were enabling encryption and user canceled, revert the state
        if (!isEncrypted(entry?.content || '')) {
            isEncryptionEnabled = false;
        }
        
        // Only close if this was for an existing encrypted entry
        if (isEncrypted(entry?.content || '')) {
            handleClose();
        }
    }

    function toggleEncryption() {
        if (!entry || !entryId) return;
        
        if (!isEncryptionEnabled) {
            // Enabling encryption - need to prompt for password
            isEncryptionEnabled = true;
            needsPassword = true;
            passwordStore.startPrompting(entryId);
        } else {
            // Disabling encryption - clear password and convert to plain text
            isEncryptionEnabled = false;
            passwordStore.clearPassword(entryId);
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        // Don't handle shortcuts when password modal is open
        if (needsPassword) return;
        
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
                    class="btn btn-encryption"
                    class:enabled={isEncryptionEnabled}
                    onclick={toggleEncryption}
                    title={isEncryptionEnabled ? 'Encryption enabled' : 'Enable encryption'}
                    disabled={needsPassword}
                >
                    {isEncryptionEnabled ? '🔒' : '🔓'}
                </button>
                <button 
                    class="btn btn-secondary"
                    onclick={() => isPreview = !isPreview}
                    disabled={needsPassword}
                >
                    {isPreview ? 'Edit' : 'Preview'}
                </button>
                <button 
                    class="btn btn-primary"
                    onclick={handleSave}
                    disabled={isSaving || needsPassword}
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
        {:else if needsPassword}
            <div class="password-required">
                <div class="password-message">
                    <h3>🔒 Password Required</h3>
                    <p>This entry is encrypted. Please enter your password to view and edit it.</p>
                </div>
            </div>
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

<!-- Password Prompt Modal -->
<PasswordPrompt
    entryTitle={entry?.title || ''}
    lastAttemptFailed={$passwordStore.lastAttemptFailed}
    isVisible={needsPassword}
    on:submit={handlePasswordSubmit}
    on:cancel={handlePasswordCancel}
/>

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

    .password-required {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
    }

    .password-message {
        text-align: center;
        color: #6b7280;
    }

    .password-message h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.125rem;
        color: #374151;
    }

    .password-message p {
        margin: 0;
        font-size: 0.875rem;
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
