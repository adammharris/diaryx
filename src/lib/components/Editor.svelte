<script lang="ts">
        import SvelteMarkdown from 'svelte-markdown';
    import type { JournalEntry } from '../storage/types';
    import { passwordStore } from '../stores/password.js';
    import { isEncrypted, encrypt } from '../utils/crypto.js';
    import { isKeyboardVisible, keyboardHeight } from '../stores/keyboard.js';
    import InfoModal from './InfoModal.svelte';

    interface Props {
        storageService: any; // The storage service instance
        entryId: string | null;
        preloadedEntry?: JournalEntry | null; // Pass pre-loaded entry to avoid double-loading
        preloadedEntryIsDecrypted?: boolean; // Flag to indicate if preloaded entry is already decrypted
        onclose?: () => void;
        onsaved?: (data: { id: string; content: string }) => void;
        onrenamed?: (data: { oldId: string; newId: string }) => void;
        onencryptiontoggle?: (data: { entryId: string; enable: boolean }) => void;
        onerror?: (data: { title: string; message: string }) => void;
        onkeyboardtoggle?: (data: { visible: boolean }) => void;
    }

    let { storageService, entryId, preloadedEntry, preloadedEntryIsDecrypted, onclose, onsaved, onrenamed, onencryptiontoggle, onerror, onkeyboardtoggle }: Props = $props();


    let entry: JournalEntry | null = $state(null);
    let content = $state('');
    let editableTitle = $state('');
    let isEditingTitle = $state(false);
    let isPreview = $state(false);
    let isSaving = $state(false);
    let isLoading = $state(false);
    let isEncryptionEnabled = $state(false);
    let showInfo = $state(false);
    
    // Mobile detection
    let isMobile = $state(false);
    let textareaFocused = $state(false);
    let textareaElement: HTMLTextAreaElement | null = $state(null);
    
    // Simplified: removed complex cache system

    // Detect mobile and load entry when entryId or storageService changes
    $effect(() => {
        // Mobile detection
        const checkMobile = () => {
            isMobile = window.innerWidth <= 768;
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        if (entryId && storageService) {
            loadEntry();
        } else {
            entry = null;
            content = '';
            editableTitle = '';
            isEncryptionEnabled = false;
        }
        
        return () => {
            window.removeEventListener('resize', checkMobile);
        };
    });
    
    // Watch for keyboard visibility changes when textarea is focused
    $effect(() => {
        if (isMobile && textareaFocused) {
            onkeyboardtoggle?.({ visible: $isKeyboardVisible });
            
            // Auto-scroll when keyboard appears/disappears
            if ($isKeyboardVisible) {
                setTimeout(() => scrollToCursor(), 300); // Delay for keyboard animation
            }
        }
    });

    // Removed reactive password store effect - encryption state is now handled in loadEntry()
    // This eliminates unnecessary re-renders when password store changes

    async function loadEntry() {
        if (!entryId || !storageService) return;
        
        // Use preloaded entry if available (should be the common case)
        if (preloadedEntry && preloadedEntry.id === entryId) {
            entry = preloadedEntry;
            editableTitle = preloadedEntry.title;
            content = preloadedEntry.content;
            isEncryptionEnabled = preloadedEntryIsDecrypted || passwordStore.hasCachedPassword(entryId);
            isLoading = false;
            return;
        }
        
        // Fallback: load from storage if no preloaded entry
        isLoading = true;
        
        try {
            const rawEntry = await storageService.getEntry(entryId);
            if (!rawEntry) return;

            entry = rawEntry;
            editableTitle = rawEntry.title;
            
            if (isEncrypted(rawEntry.content)) {
                isEncryptionEnabled = true;
                const cachedContent = passwordStore.getCachedDecryptedContent(entryId);
                
                if (cachedContent) {
                    content = cachedContent;
                } else {
                    const decryptedEntry = await passwordStore.tryDecryptWithCache(rawEntry);
                    if (decryptedEntry) {
                        content = decryptedEntry.content;
                    } else {
                        onerror?.({
                            title: 'Decryption Error',
                            message: 'Unable to decrypt entry. Please try selecting it again.'
                        });
                        return;
                    }
                }
            } else {
                isEncryptionEnabled = passwordStore.hasCachedPassword(entryId);
                content = rawEntry.content;
            }
        } catch (error) {
            console.error('Failed to load entry:', error);
        } finally {
            isLoading = false;
        }
    }

    async function handleSave() {
        if (!entry || !storageService) return; // Ensure storageService is defined
        
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
            
            const success = await storageService.saveEntry(entry.id, contentToSave);
            if (success) {
                onsaved?.({ id: entry.id, content: content }); // Pass original decrypted content
                // Update local entry with the original content (not encrypted)
                entry.content = content; // Keep the decrypted content for display
                entry.modified_at = new Date().toISOString();
                
                // Cache update removed for simplicity
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
            const newId = await storageService.renameEntry(entryId, editableTitle.trim());
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

    function handleTextareaFocus() {
        textareaFocused = true;
        // Notify parent component that keyboard might be visible
        if (isMobile && $isKeyboardVisible) {
            onkeyboardtoggle?.({ visible: true });
        }
    }

    function handleTextareaBlur() {
        textareaFocused = false;
        // Notify parent component that keyboard is no longer relevant
        if (isMobile) {
            onkeyboardtoggle?.({ visible: false });
        }
    }

    function scrollToCursor() {
        if (!textareaElement || !isMobile) return;
        
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
            if (!textareaElement) return;
            
            try {
                const cursorPosition = textareaElement.selectionStart;
                const textBeforeCursor = content.substring(0, cursorPosition);
                const lines = textBeforeCursor.split('\n');
                const currentLine = lines.length - 1;
                
                // Calculate approximate cursor position
                const lineHeight = parseFloat(getComputedStyle(textareaElement).lineHeight) || 24;
                const cursorTop = currentLine * lineHeight;
                
                // Get textarea container dimensions
                const containerRect = textareaElement.getBoundingClientRect();
                const scrollTop = textareaElement.scrollTop;
                const containerHeight = containerRect.height;
                
                // Calculate if cursor is visible
                const relativeTop = cursorTop - scrollTop;
                const margin = lineHeight * 2; // Keep 2 lines margin
                
                if (relativeTop < margin) {
                    // Cursor is too close to top, scroll up
                    textareaElement.scrollTop = Math.max(0, cursorTop - margin);
                } else if (relativeTop > containerHeight - margin) {
                    // Cursor is too close to bottom, scroll down
                    textareaElement.scrollTop = cursorTop - containerHeight + margin;
                }
                
                console.log('Scrolled to cursor:', { cursorPosition, currentLine, cursorTop, scrollTop: textareaElement.scrollTop });
            } catch (error) {
                console.warn('Error scrolling to cursor:', error);
            }
        });
    }

    function handleTextareaInput() {
        if (isMobile && textareaFocused) {
            scrollToCursor();
        }
    }

    function handleTextareaClick() {
        if (isMobile) {
            // Small delay to allow selection to update
            setTimeout(() => scrollToCursor(), 50);
        }
    }

    function handleShowInfo() {
        showInfo = true;
    }

    function handleCloseInfo() {
        showInfo = false;
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if entry}
    <div class="editor-container">
        <div class="editor-header">
            <div class="editor-title-row">
                {#if isEditingTitle}
                    <input 
                        class="editor-title-input"
                        bind:value={editableTitle}
                        onkeydown={handleTitleKeydown}
                        onblur={handleTitleSave}
                    />
                {:else}
                    <button 
                        class="editor-title"
                        onclick={() => isEditingTitle = true}
                        title="Click to edit title"
                        type="button"
                    >
                        {entry.title}
                    </button>
                {/if}
                <button 
                    class="btn btn-ghost btn-close-mobile"
                    class:mobile-close={isMobile}
                    onclick={handleClose}
                    title={isMobile ? 'Back to entries' : 'Close'}
                >
                    {#if isMobile}
                        ← Back
                    {:else}
                        ×
                    {/if}
                </button>
            </div>
            <div class="editor-controls">
                <button 
                    class="btn btn-encryption"
                    class:enabled={isEncryptionEnabled}
                    onclick={toggleEncryption}
                    title={isEncryptionEnabled ? 'Encryption enabled' : 'Enable encryption'}
                >
                    {#if isEncryptionEnabled}
                        <img src="/src/lib/icons/material-symbols--lock.svg" class="icon" alt="Encrypted" />
                    {:else}
                        <img src="/src/lib/icons/material-symbols--lock-open-right.svg" class="icon" alt="Plain text" />
                    {/if}
                </button>
                <button 
                    class="btn btn-info"
                    onclick={handleShowInfo}
                    title="Entry information and metadata"
                >
                    <img src="/src/lib/icons/material-symbols--info.svg" class="icon" alt="Info" />
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
            </div>
        </div>

        <div class="editor-content-area">
            {#if isLoading}
                <div class="loading">Loading...</div>
            {:else if isPreview}
                <div class="preview-container">
                    <SvelteMarkdown source={content} />
                </div>
            {:else}
                <textarea
                    bind:this={textareaElement}
                    class="editor-textarea"
                    bind:value={content}
                    placeholder="Start writing your journal entry..."
                    spellcheck="true"
                    onfocus={handleTextareaFocus}
                    onblur={handleTextareaBlur}
                    oninput={handleTextareaInput}
                    onclick={handleTextareaClick}
                ></textarea>
            {/if}
        </div>

        <div class="editor-status" class:keyboard-animating={isMobile && $isKeyboardVisible && $keyboardHeight > 0} style={isMobile && $isKeyboardVisible && $keyboardHeight > 0 ? 'padding-bottom: 0.5rem;' : 'padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));'}>
            <span class="encryption-status">
                {#if isEncryptionEnabled}
                    <img src="/src/lib/icons/material-symbols--lock.svg" class="status-icon" alt="Encrypted" />
                    Encrypted
                {:else}
                    <img src="/src/lib/icons/material-symbols--edit-note.svg" class="status-icon" alt="Plain text" />
                    Plain text
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

<!-- Info Modal -->
<InfoModal 
    entry={entry}
    isVisible={showInfo}
    onclose={handleCloseInfo}
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
        flex-shrink: 0;
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
        background: none;
        border: none;
        font-family: inherit;
        text-align: left;
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

    .btn-ghost.mobile-close {
        padding: 0.75rem 1rem;
        font-size: 0.875rem;
        min-width: auto;
    }

    .btn-close-mobile {
        padding: 0.5rem 0.75rem;
        font-size: 0.8rem;
        flex-shrink: 0;
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

    .btn-info {
        background: #f3f4f6;
        color: #6b7280;
        border-color: #d1d5db;
        transition: all 0.2s ease;
    }

    .btn-info:hover {
        background: #e5e7eb;
        color: #374151;
        border-color: #9ca3af;
    }

    .editor-content-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0; /* Allow flex item to shrink and enable child scrolling */
    }

    .editor-textarea {
        width: 100%;
        flex: 1;
        padding: 1.5rem;
        border: none;
        outline: none;
        resize: none;
        font-family: 'SF Mono', 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace;
        font-size: 0.9rem;
        line-height: 1.6;
        color: #374151;
        box-sizing: border-box;
    }

    .preview-container {
        flex: 1;
        padding: 1.5rem;
        overflow-y: auto;
        line-height: 1.6;
        color: #374151;
        height: 0; /* Allow flex item to shrink and enable scrolling */
        box-sizing: border-box;
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
        flex-shrink: 0;
    }

    .encryption-status {
        font-weight: 500;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #f3f4f6;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .btn .icon {
        width: 14px;
        height: 14px;
        filter: invert(1) sepia(1) saturate(0) hue-rotate(0deg) brightness(0.5);
    }

    .btn-encryption .icon {
        filter: invert(42%) sepia(93%) saturate(1352%) hue-rotate(87deg) brightness(119%) contrast(119%);
    }

    .btn-encryption.enabled .icon {
        filter: invert(53%) sepia(93%) saturate(1352%) hue-rotate(28deg) brightness(119%) contrast(119%);
    }

    .status-icon {
        width: 12px;
        height: 12px;
        filter: invert(1) sepia(1) saturate(0) hue-rotate(0deg) brightness(0.5);
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


    /* Mobile-specific styles */
    @media (max-width: 768px) {
        .editor-container {
            height: 100%; /* Inherit height from parent mobile-view */
            border-radius: 0;
            box-shadow: none;
            display: flex;
            flex-direction: column;
            background: white;
            overflow: hidden; /* Prevent the container itself from scrolling */
            position: relative;
        }

        .editor-header {
            flex-shrink: 0; /* Prevent header from shrinking */
            padding: 0.75rem 1rem;
            padding-top: calc(0.75rem + env(safe-area-inset-top));
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            background: #f9fafb;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .editor-title-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.5rem;
            width: 100%;
        }

        .editor-title {
            flex: 1;
            font-size: 1.125rem;
            line-height: 1.4;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .editor-title-input {
            font-size: 1.125rem;
        }

        .editor-controls {
            display: flex;
            gap: 0.5rem;
            width: 100%;
        }

        .btn {
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
        }

        .btn-close-mobile {
            font-size: 1rem;
            font-weight: 500;
        }

        .editor-content-area {
            flex: 1; /* Take up all available space */
            min-height: 0; /* Allow content area to shrink fully */
            overflow-y: auto; /* Make ONLY this area scrollable */
            -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
            /* When keyboard appears, this area will automatically shrink */
        }

        .editor-textarea {
            width: 100%;
            height: 100%;
            padding: 1rem;
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            padding-bottom: 2rem; /* Extra bottom padding to ensure content isn't hidden */
            font-size: 1rem;
            line-height: 1.6;
            border: none;
            outline: none;
            resize: none;
            background: transparent;
            box-sizing: border-box;
            overflow-y: auto;
        }

        .preview-container {
            padding: 1rem;
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            padding-bottom: 2rem; /* Extra bottom padding to ensure content isn't hidden */
            height: 100%;
            overflow-y: auto;
            box-sizing: border-box;
        }

        .editor-status {
            flex-shrink: 0; /* Prevent footer from shrinking */
            padding: 0.5rem 1rem;
            padding-bottom: 0.5rem; /* Base padding, safe area handled dynamically */
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            font-size: 0.75rem;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 0.5rem;
        }
        
        /* Smooth keyboard animation for iOS Tauri footer */
        .editor-status.keyboard-animating {
            transition: padding-bottom var(--keyboard-animation-duration, 0.25s) cubic-bezier(0.36, 0.66, 0.04, 1);
        }

        .loading,
        .no-entry {
            padding: 1rem;
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
        }
    }
</style>
