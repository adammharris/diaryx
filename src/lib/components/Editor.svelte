<script lang="ts">
        import SvelteMarkdown from 'svelte-markdown';
    import type { JournalEntry } from '../storage/types';
    import { apiAuthService, apiAuthStore } from '../services/api-auth.service.js';
    import { e2eEncryptionService, e2eSessionStore } from '../services/e2e-encryption.service.js';
    import { isKeyboardVisible, keyboardHeight } from '../stores/keyboard.js';
    import { metadataStore } from '../stores/metadata.js';
    // Removed old crypto imports - now using E2E encryption service
    import InfoModal from './InfoModal.svelte';
    import TagSelector from './TagSelector.svelte';
    import { FrontmatterService } from '../storage/frontmatter.service.js';

    interface Props {
        storageService: any; // The storage service instance
        entryId: string | null;
        preloadedEntry?: JournalEntry | null; // Pass pre-loaded entry to avoid double-loading
        onclose?: () => void;
        onsaved?: (data: { id: string; content: string }) => void;
        onrenamed?: (data: { oldId: string; newId: string }) => void;
        onpublishtoggle?: (data: { entryId: string; publish: boolean; tagIds?: string[] }) => void;
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
    let saveInProgress = $state(false);
    
    // Tag selection for sharing
    let selectedTagIds = $state<string[]>([]);
    let showTagSelector = $state(false);
    let frontmatterTags = $state<string[]>([]);
    
    // Entry locking state (for E2E encryption)
    let isEntryLocked = $state(false);
    
    // Mobile detection
    let isMobile = $state(false);
    let textareaFocused = $state(false);
    let textareaElement: HTMLTextAreaElement | null = $state(null);
    
    // E2E encryption state
    let e2eSession = $derived($e2eSessionStore);
    let authSession = $derived($apiAuthStore);
    let canPublish = $derived.by(() => {
        const auth = authSession?.isAuthenticated;
        const e2e = e2eSession?.isUnlocked;
        console.log('canPublish check:', { auth, e2e, canPublish: auth && e2e });
        return auth && e2e;
    });
    let canEdit = $derived(!isEntryLocked); // Can edit if entry is not locked
    
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
        if (content && content !== lastSavedContent && !isLoading && !saveInProgress) {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            saveStatus = 'idle';
            saveTimeout = setTimeout(() => {
                handleAutosave();
            }, AUTOSAVE_DELAY);
            
            // Update frontmatter tags when content changes
            updateFrontmatterTags();
        }
    });

    async function loadEntry() {
        if (!entryId || !storageService) return;
        
        // Don't reload entry content if a save is in progress to prevent race conditions
        if (saveInProgress) {
            console.log('Skipping loadEntry - save in progress');
            return;
        }
        
        // Use preloaded entry if available (should be the common case)
        if (preloadedEntry && preloadedEntry.id === entryId) {
            entry = preloadedEntry;
            editableTitle = preloadedEntry.title;
            content = preloadedEntry.content;
            
            // Get cached publish status from metadata store (no async call needed!)
            const metadata = $metadataStore.entries[entryId];
            isPublished = metadata?.isPublished || false;
            
            // Entry is locked only if it's published (from cloud) AND E2E encryption exists but is not unlocked
            if (isPublished && e2eEncryptionService.hasStoredKeys() && !e2eSession?.isUnlocked) {
                isEntryLocked = true;
            } else {
                isEntryLocked = false;
            }
            
            isLoading = false;
            
            // Extract frontmatter tags for TagSelector pre-population
            updateFrontmatterTags();
            return;
        }
        
        // Fallback: load from storage if no preloaded entry
        isLoading = true;
        
        try {
            const rawEntry = await storageService.getEntry(entryId);
            if (!rawEntry) return;

            entry = rawEntry;
            editableTitle = rawEntry.title;
            // Don't overwrite content if save is in progress
            if (!saveInProgress) {
                content = rawEntry.content;
            }
            
            // Get cached publish status from metadata store (no async call needed!)
            const metadata = $metadataStore.entries[entryId];
            isPublished = metadata?.isPublished || false;
            
            // Entry is locked only if it's published (from cloud) AND E2E encryption exists but is not unlocked
            if (isPublished && e2eEncryptionService.hasStoredKeys() && !e2eSession?.isUnlocked) {
                isEntryLocked = true;
            } else {
                isEntryLocked = false;
            }
        } catch (error) {
            console.error('Failed to load entry:', error);
        } finally {
            isLoading = false;
            
            // Extract frontmatter tags for TagSelector pre-population
            updateFrontmatterTags();
        }
    }

    async function saveEntryContent() {
        if (!entry || !storageService || saveInProgress) return false;
        
        // Capture content at start of save to prevent race conditions
        const contentToSave = content;
        saveInProgress = true;
        saveStatus = 'saving';
        
        try {
            // Save content as plain text (no encryption)
            const success = await storageService.saveEntry(entry.id, contentToSave);
            
            if (success) {
                onsaved?.({ id: entry.id, content: contentToSave });
                entry.content = contentToSave;
                entry.modified_at = new Date().toISOString();
                lastSavedContent = contentToSave;
                saveStatus = 'saved';
                
                // If authenticated and published, sync changes to cloud
                if (apiAuthService.isAuthenticated() && isPublished) {
                    await storageService.syncEntryToCloud(entry.id);
                }
                
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
        } finally {
            saveInProgress = false;
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
        if (!canPublish) return;
        
        const newPublishState = !isPublished;
        
        if (newPublishState) {
            // When publishing, show tag selector first
            showTagSelector = true;
        } else {
            // When unpublishing, proceed directly
            isPublished = false;
            onpublishtoggle?.({ entryId, publish: false, tagIds: [] });
        }
    }

    function handleTagSelectionChange(tagIds: string[]) {
        selectedTagIds = tagIds;
    }

    function handlePublishWithTags() {
        if (!entry || !entryId) return;
        
        // Proceed with publishing
        isPublished = true;
        showTagSelector = false;
        
        // Notify parent component with selected tags
        onpublishtoggle?.({ entryId, publish: true, tagIds: selectedTagIds });
    }

    function handleCancelPublish() {
        showTagSelector = false;
        selectedTagIds = [];
    }

    function updateFrontmatterTags() {
        try {
            if (!content) {
                frontmatterTags = [];
                return;
            }

            const parsedContent = FrontmatterService.parseContent(content);
            const extractedTags = FrontmatterService.extractTags(parsedContent.frontmatter);
            
            // Only update if tags have actually changed to avoid unnecessary re-renders
            if (!arraysEqual(frontmatterTags, extractedTags)) {
                frontmatterTags = extractedTags;
                console.log('Updated frontmatter tags:', frontmatterTags);
            }
        } catch (error) {
            console.warn('Failed to extract frontmatter tags:', error);
            frontmatterTags = [];
        }
    }

    function arraysEqual<T>(a: T[], b: T[]): boolean {
        return a.length === b.length && a.every((val, i) => val === b[i]);
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

    function handleUnlockEntry() {
        // With E2E encryption, unlocking an entry means prompting for E2E password
        // This will redirect to settings to unlock E2E encryption
        onerror?.({
            title: 'Unlock Required',
            message: 'This entry requires E2E encryption to be unlocked. Please go to Settings to enter your encryption password.'
        });
    }

    // Removed old password prompt handlers - no longer needed with E2E encryption
</script>

<svelte:window onkeydown={handleKeydown} />

{#if entry}
    <div class="flex flex-col h-full bg-surface rounded-lg shadow-lg overflow-hidden">
        <div class="flex justify-between items-center p-6 border-b bg-background">
            <div class="flex items-center flex-1">
                {#if isEditingTitle}
                    <input 
                        class="title-input flex-1 mr-2"
                        bind:value={editableTitle}
                        onkeydown={handleTitleKeydown}
                        onblur={handleTitleSave}
                    />
                {:else}
                    <button 
                        class="text-xl font-semibold text-left bg-transparent border-0 p-1 m-0 font-inherit cursor-pointer rounded transition-colors hover:bg-surface"
                        onclick={() => isEditingTitle = true}
                        title="Click to edit title"
                        type="button"
                        style="color: var(--color-text); font-family: inherit;"
                    >
                        {entry.title}
                    </button>
                {/if}
                <button 
                    class="close-btn"
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
            <div class="flex gap-2 items-center">
                {#if isEntryLocked}
                    <button 
                        class="btn btn-unlock"
                        onclick={handleUnlockEntry}
                        title="Unlock encrypted entry"
                    >
                        <img src="/material-symbols--lock.svg" class="icon" alt="Locked" />
                        Unlock
                    </button>
                {:else}
                    <button 
                        class="btn btn-publish"
                        class:published={isPublished}
                        onclick={togglePublish}
                        title={isPublished ? 'Published - Click to unpublish' : canPublish ? 'Draft - Click to publish' : 'Sign in and unlock encryption to publish'}
                        disabled={!canPublish}
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
                >
                    <img src="/material-symbols--info.svg" class="icon" alt="Info" />
                </button>
                <button 
                    class="btn btn-secondary"
                    onclick={() => isPreview = !isPreview}
                    disabled={isEntryLocked}
                    title={isEntryLocked ? 'Unlock entry to preview' : (isPreview ? 'Switch to edit mode' : 'Switch to preview mode')}
                >
                    {isPreview ? 'Edit' : 'Preview'}
                </button>
                
            </div>
        </div>

        <div class="flex flex-col flex-1 min-h-0">
            {#if isLoading}
                <div class="flex items-center justify-center p-8">
                    <div class="spinner mr-2"></div>
                    <span class="text-secondary">Loading...</span>
                </div>
            {:else if isEntryLocked}
                <div class="flex flex-col items-center justify-center p-8 text-center">
                    <div class="mb-4">
                        <img src="/material-symbols--lock.svg" class="icon-xl opacity-50" alt="Locked" />
                    </div>
                    <h3 class="text-xl font-semibold mb-2">Entry is Encrypted</h3>
                    <p class="text-secondary mb-6">This entry is encrypted and requires a password to view or edit.</p>
                    <button 
                        class="btn btn-unlock-large"
                        onclick={handleUnlockEntry}
                    >
                        <img src="/material-symbols--lock-open-right.svg" class="icon" alt="Unlock" />
                        Unlock Entry
                    </button>
                </div>
            {:else if isPreview}
                <div class="preview-container p-6 overflow-y-auto flex-1">
                    <SvelteMarkdown source={content} />
                </div>
            {:else}
                <textarea
                    bind:this={textareaElement}
                    class="w-full flex-1 p-6 border-0 resize-none font-mono text-sm leading-relaxed bg-surface outline-none text-base"
                    style="color: var(--color-text); font-family: 'SF Mono', 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace;"
                    bind:value={content}
                    placeholder="Start writing your journal entry..."
                    spellcheck="true"
                    onfocus={handleTextareaFocus}
                    onblur={handleTextareaBlur}
                    oninput={handleTextareaInput}
                    onclick={handleTextareaClick}
                    disabled={isEntryLocked}
                ></textarea>
            {/if}
        </div>

        <div class="flex justify-between items-center px-6 py-2 border-t bg-background text-sm" class:keyboard-animating={isMobile && $isKeyboardVisible && $keyboardHeight > 0} style={isMobile && $isKeyboardVisible && $keyboardHeight > 0 ? 'padding-bottom: 0.5rem;' : 'padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));'}>
            <span class="text-secondary">
                {#if isEntryLocked}
                    <img src="/material-symbols--lock.svg" class="status-icon" alt="Locked" />
                    Locked
                {:else if canPublish}
                    {#if isPublished}
                        <img src="/material-symbols--public.svg" class="status-icon" alt="Published" />
                        Published
                    {:else}
                        <img src="/material-symbols--draft.svg" class="status-icon" alt="Draft" />
                        Draft
                    {/if}
                {:else if apiAuthService.isAuthenticated()}
                    <img src="/material-symbols--lock.svg" class="status-icon" alt="Encryption locked" />
                    Encryption locked
                {:else}
                    <img src="/material-symbols--edit-note.svg" class="status-icon" alt="Local only" />
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
    <div class="flex items-center justify-center p-8">
        <div class="spinner mr-2"></div>
        <span class="text-secondary">Loading entry...</span>
    </div>
{:else}
    <div class="flex items-center justify-center p-8 text-center">
        <p class="text-secondary">Select an entry to start editing</p>
    </div>
{/if}

<!-- Info Modal -->
<InfoModal 
    entry={entry}
    isVisible={showInfo}
    onclose={handleCloseInfo}
/>

<!-- Tag Selection Modal for Publishing -->
{#if showTagSelector}
    <div class="modal-overlay">
        <div class="modal-content publish-modal">
            <div class="modal-header">
                <h3 class="modal-title">Share Entry</h3>
                <button 
                    class="close-btn"
                    onclick={handleCancelPublish}
                    aria-label="Cancel publishing"
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
                        onclick={handleCancelPublish}
                    >
                        Cancel
                    </button>
                    <button 
                        class="btn btn-primary"
                        onclick={handlePublishWithTags}
                        disabled={selectedTagIds.length === 0}
                    >
                        {selectedTagIds.length === 0 ? 'Select tags to publish' : `Publish & Share`}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Password prompt no longer needed with E2E encryption -->


<style>
    /* Component-specific styles that can't be replaced with utility classes */

    /* Markdown preview styling - component-specific global styles */

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

    /* Icons - component-specific sizing */
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


    /* Mobile-specific adaptations */
    @media (max-width: 768px) {
        /* Smooth keyboard animation for iOS Tauri footer */
        .keyboard-animating {
            transition: padding-bottom var(--keyboard-animation-duration, 0.25s) cubic-bezier(0.36, 0.66, 0.04, 1);
        }
        
        /* Mobile container adaptations */
        .flex.flex-col.h-full.bg-surface.rounded-lg.shadow-lg.overflow-hidden {
            height: 100%;
            border-radius: 0;
            box-shadow: none;
        }
        
        /* Mobile header adaptations */  
        .flex.justify-between.items-center.p-6.border-b.bg-background {
            padding: 0.75rem 1rem;
            padding-top: calc(0.75rem + env(safe-area-inset-top));
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            flex-direction: column;
            gap: 0.75rem;
        }
        
        /* Mobile textarea adaptations */
        textarea {
            padding: 1rem;
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            padding-bottom: 2rem;
            font-size: 1rem;
            line-height: 1.6;
        }
        
        /* Mobile content area adaptations */
        .flex.flex-col.flex-1.min-h-0 {
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }
        
        /* Mobile preview adaptations */
        .preview-container {
            padding: 1rem !important;
            padding-left: calc(1rem + env(safe-area-inset-left)) !important;
            padding-right: calc(1rem + env(safe-area-inset-right)) !important;
            padding-bottom: 2rem !important;
        }
    }

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
