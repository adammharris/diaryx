<script lang="ts">
        import SvelteMarkdown from 'svelte-markdown';
    import type { JournalEntry } from '../storage/types';
    import { apiAuthService } from '../services/api-auth.service.js';
    import { isKeyboardVisible, keyboardHeight } from '../stores/keyboard.js';
    import InfoModal from './InfoModal.svelte';

    interface Props {
        storageService: any; // The storage service instance
        entryId: string | null;
        preloadedEntry?: JournalEntry | null; // Pass pre-loaded entry to avoid double-loading
        onclose?: () => void;
        onsaved?: (data: { id: string; content: string }) => void;
        onrenamed?: (data: { oldId: string; newId: string }) => void;
        onpublishtoggle?: (data: { entryId: string; publish: boolean }) => void;
        onerror?: (data: { title: string; message: string }) => void;
        onkeyboardtoggle?: (data: { visible: boolean }) => void;
    }

    let { storageService, entryId, preloadedEntry, onclose, onsaved, onrenamed, onpublishtoggle, onerror, onkeyboardtoggle }: Props = $props();


    let entry: JournalEntry | null = $state(null);
    let content = $state('');
    let editableTitle = $state('');
    let isEditingTitle = $state(false);
    let isPreview = $state(false);
    let isSaving = $state(false);
    let isLoading = $state(false);
    let lastSavedContent = $state('');
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    let saveStatus: 'idle' | 'saving' | 'saved' | 'error' = $state('idle');
    const AUTOSAVE_DELAY = 1500; // 1.5 seconds
    let isPublished = $state(false);
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
            isPublished = false;
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

    // Autosave effect
    $effect(() => {
        if (content && content !== lastSavedContent && !isLoading) {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            saveStatus = 'idle';
            saveTimeout = setTimeout(() => {
                handleAutosave();
            }, AUTOSAVE_DELAY);
        }
    });

    async function loadEntry() {
        if (!entryId || !storageService) return;
        
        // Use preloaded entry if available (should be the common case)
        if (preloadedEntry && preloadedEntry.id === entryId) {
            entry = preloadedEntry;
            editableTitle = preloadedEntry.title;
            content = preloadedEntry.content;
            // TODO: Get publish status from cloud API
            isPublished = false; // Default to draft
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
            content = rawEntry.content;
            
            // TODO: Get publish status from cloud API when authenticated
            isPublished = false; // Default to draft
        } catch (error) {
            console.error('Failed to load entry:', error);
        } finally {
            isLoading = false;
        }
    }

    async function saveEntryContent() {
        if (!entry || !storageService) return false;
        
        saveStatus = 'saving';
        try {
            // Save content as plain text (no encryption)
            const success = await storageService.saveEntry(entry.id, content);
            if (success) {
                onsaved?.({ id: entry.id, content: content });
                entry.content = content;
                entry.modified_at = new Date().toISOString();
                lastSavedContent = content;
                saveStatus = 'saved';
                
                // TODO: If authenticated and published, sync to cloud
                
                return true;
            } else {
                onerror?.({
                    title: 'Save Failed',
                    message: 'Failed to save entry. Please try again.'
                });
                saveStatus = 'error';
                return false;
            }
        } catch (error) {
            console.error('Save error:', error);
            onerror?.({
                title: 'Save Failed',
                message: 'Failed to save entry. Please try again.'
            });
            saveStatus = 'error';
            return false;
        }
    }

    async function handleAutosave() {
        if (content === lastSavedContent) {
            saveStatus = 'idle';
            return;
        }
        await saveEntryContent();
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



    function togglePublish() {
        if (!entry || !entryId) return;
        if (!apiAuthService.isAuthenticated()) return;
        
        const newPublishState = !isPublished;
        isPublished = newPublishState;
        
        // Notify parent component to handle cloud sync
        onpublishtoggle?.({ entryId, publish: newPublishState });
    }

    function handleKeydown(event: KeyboardEvent) {
        // Handle keyboard shortcuts
        
        
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
                    class="btn btn-publish"
                    class:published={isPublished}
                    onclick={togglePublish}
                    title={isPublished ? 'Published - Click to unpublish' : 'Draft - Click to publish'}
                    disabled={!apiAuthService.isAuthenticated()}
                >
                    {#if isPublished}
                        <img src="/icons/material-symbols--public.svg" class="icon" alt="Published" />
                    {:else}
                        <img src="/icons/material-symbols--draft.svg" class="icon" alt="Draft" />
                    {/if}
                </button>
                <button 
                    class="btn btn-info"
                    onclick={handleShowInfo}
                    title="Entry information and metadata"
                >
                    <img src="/icons/material-symbols--info.svg" class="icon" alt="Info" />
                </button>
                <button 
                    class="btn btn-secondary"
                    onclick={() => isPreview = !isPreview}
                >
                    {isPreview ? 'Edit' : 'Preview'}
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
            <span class="publish-status">
                {#if apiAuthService.isAuthenticated()}
                    {#if isPublished}
                        <img src="/icons/material-symbols--public.svg" class="status-icon" alt="Published" />
                        Published
                    {:else}
                        <img src="/icons/material-symbols--draft.svg" class="status-icon" alt="Draft" />
                        Draft
                    {/if}
                {:else}
                    <img src="/icons/material-symbols--edit-note.svg" class="status-icon" alt="Local only" />
                    Local only
                {/if}
            </span>
            <span class="word-count">
                {content.split(/\s+/).filter(w => w.length > 0).length} words
            </span>
            <span class="last-modified">
                Last modified: {new Date(entry.modified_at).toLocaleString()}
            </span>
            <span class="autosave-status">
                {#if saveStatus === 'saving'}
                    Saving...
                {:else if saveStatus === 'saved'}
                    Saved
                {:else if saveStatus === 'error'}
                    Save Error!
                {/if}
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
        background: var(--color-surface);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        overflow: hidden;
    }

    .editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-background);
        flex-shrink: 0;
    }

    .editor-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
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

    @media (hover: hover) {
        .editor-title:hover {
            background-color: var(--color-border);
        }
    }

    .editor-title-input {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
        margin: 0;
        padding: 0.25rem 0.5rem;
        border: 2px solid var(--color-primary);
        border-radius: 4px;
        background: var(--color-surface);
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

    

    .btn-secondary {
        background: var(--color-surface);
        color: var(--color-text);
        border-color: var(--color-border);
    }

    @media (hover: hover) {
        .btn-secondary:hover {
            background: var(--color-background);
            border-color: var(--color-textSecondary);
        }
    }

    .btn-ghost {
        background: transparent;
        color: var(--color-textSecondary);
        padding: 0.5rem;
    }

    @media (hover: hover) {
        .btn-ghost:hover {
            background: var(--color-border);
            color: var(--color-text);
        }
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

    .btn-publish {
        background: var(--color-border);
        color: var(--color-textSecondary);
        border-color: var(--color-border);
        transition: all 0.2s ease;
    }

    .btn-publish:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    @media (hover: hover) {
        .btn-publish:hover:not(:disabled) {
            background: var(--color-textSecondary);
            color: var(--color-text);
        }
    }

    .btn-publish.published {
        background: #10b981;
        color: white;
        border-color: #10b981;
    }

    @media (hover: hover) {
        .btn-publish.published:hover {
            background: #059669;
            border-color: #059669;
        }
    }

    .btn-info {
        background: var(--color-border);
        color: var(--color-textSecondary);
        border-color: var(--color-border);
        transition: all 0.2s ease;
    }

    @media (hover: hover) {
        .btn-info:hover {
            background: var(--color-textSecondary);
            color: var(--color-text);
            border-color: var(--color-textSecondary);
        }
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
        color: var(--color-text);
        background: var(--color-surface);
        box-sizing: border-box;
    }

    .preview-container {
        flex: 1;
        padding: 1.5rem;
        overflow-y: auto;
        line-height: 1.6;
        color: var(--color-text);
        height: 0; /* Allow flex item to shrink and enable scrolling */
        box-sizing: border-box;
    }

    .preview-container :global(h1) {
        font-size: 1.875rem;
        font-weight: 700;
        color: var(--color-text);
        margin-bottom: 1rem;
    }

    .preview-container :global(h2) {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text);
        margin: 1.5rem 0 0.75rem;
    }

    .preview-container :global(h3) {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
        margin: 1.25rem 0 0.5rem;
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
        border-left: 4px solid var(--color-border);
        padding-left: 1rem;
        margin: 1rem 0;
        color: var(--color-textSecondary);
        font-style: italic;
    }

    .preview-container :global(code) {
        background: var(--color-background);
        padding: 0.125rem 0.25rem;
        border-radius: 3px;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: 0.875em;
    }

    .preview-container :global(pre) {
        background: var(--color-background);
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
        border-top: 1px solid var(--color-border);
        background: var(--color-background);
        font-size: 0.75rem;
        color: var(--color-textSecondary);
        gap: 1rem;
        flex-shrink: 0;
    }

    .publish-status {
        font-weight: 500;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: var(--color-border);
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .btn .icon {
        width: 14px;
        height: 14px;
        filter: var(--color-icon-filter);
    }

    .btn-publish .icon {
        filter: var(--color-icon-filter);
    }

    .btn-publish.published .icon {
        filter: brightness(0) invert(1);
    }

    .status-icon {
        width: 12px;
        height: 12px;
        filter: var(--color-icon-filter);
    }

    .loading,
    .no-entry {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--color-textSecondary);
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
            background: var(--color-surface);
            overflow: hidden; /* Prevent the container itself from scrolling */
            position: relative;
        }

        .editor-header {
            flex-shrink: 0; /* Prevent header from shrinking */
            padding: 0.75rem 1rem;
            padding-top: calc(0.75rem + env(safe-area-inset-top));
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            background: var(--color-background);
            border-bottom: 1px solid var(--color-border);
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
            background: var(--color-surface);
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
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1.5rem;
        border-top: 1px solid var(--color-border);
        background: var(--color-background);
        font-size: 0.75rem;
        color: var(--color-textSecondary);
        gap: 1rem;
        flex-shrink: 0;
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
