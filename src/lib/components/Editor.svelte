<script lang="ts">
    import type { JournalEntry } from "../storage/types";
    import {
        apiAuthService,
        apiAuthStore,
    } from "../services/api-auth.service.js";
    import {
        e2eEncryptionService,
        e2eSessionStore,
    } from "../services/e2e-encryption.service.js";
    import { isKeyboardVisible, keyboardHeight } from "../stores/keyboard.js";
    import { metadataStore } from "../stores/metadata.js";
    import { FrontmatterService } from "../storage/frontmatter.service.js";
    import {
        setupMobileDetection,
        handleTextareaFocus,
        handleTextareaBlur,
        arraysEqual,
    } from "./editor/mobile-utils";

    // Import new component parts
    import EditorHeader from "./editor/EditorHeader.svelte";
    import EditorContent from "./editor/EditorContent.svelte";
    import EditorFooter from "./editor/EditorFooter.svelte";
    import PublishModal from "./editor/PublishModal.svelte";
    import InfoModal from "./InfoModal.svelte";

    interface Props {
        storageService: any; // The storage service instance
        entryId: string | null;
        preloadedEntry?: JournalEntry | null; // Pass pre-loaded entry to avoid double-loading
        onclose?: () => void;
        onsaved?: (data: { id: string; content: string }) => void;
        onrenamed?: (data: { oldId: string; newId: string }) => void;
        onpublishtoggle?: (data: {
            entryId: string;
            publish: boolean;
            tagIds?: string[];
        }) => void;
        onerror?: (data: { title: string; message: string }) => void;
        onkeyboardtoggle?: (data: { visible: boolean }) => void;
    }

    let {
        storageService,
        entryId,
        preloadedEntry,
        onclose,
        onsaved,
        onrenamed,
        onpublishtoggle,
        onerror,
        onkeyboardtoggle,
    }: Props = $props();

    let entry: JournalEntry | null = $state(null);
    let content = $state("");
    let editableTitle = $state("");
    let isEditingTitle = $state(false);
    let isPreview = $state(false);
    let isSaving = $state(false);
    let isLoading = $state(false);
    let lastSavedContent = $state("");
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    let saveStatus: "idle" | "saving" | "saved" | "error" = $state("idle");
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
    let mobileCleanup: (() => void) | null = null;

    // E2E encryption state
    let e2eSession = $derived($e2eSessionStore);
    let authSession = $derived($apiAuthStore);
    let canPublish = $derived.by(() => {
        const auth = authSession?.isAuthenticated;
        const e2e = e2eSession?.isUnlocked;
        return !!auth && !!e2e;
    });
    let canEdit = $derived(!isEntryLocked); // Can edit if entry is not locked

    // Simplified: removed complex cache system

    // Setup mobile detection and load entry when entryId changes
    $effect(() => {
        // Setup mobile detection
        mobileCleanup = setupMobileDetection((mobile) => {
            isMobile = mobile;
        });

        return () => {
            mobileCleanup?.();
        };
    });

    // Load entry when entryId changes
    $effect(() => {
        if (entryId && storageService) {
            loadEntry();
        } else {
            entry = null;
            content = "";
            editableTitle = "";
            lastSavedContent = "";
            isPublished = false;
        }
    });

    // Watch for keyboard visibility changes when textarea is focused
    $effect(() => {
        if (isMobile && textareaFocused) {
            onkeyboardtoggle?.({ visible: $isKeyboardVisible });
        }
    });

    // Removed reactive password store effect - encryption state is now handled in loadEntry()
    // This eliminates unnecessary re-renders when password store changes

    // Autosave effect
    $effect(() => {
        if (content !== lastSavedContent && !isLoading && !saveInProgress) {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            saveStatus = "idle";
            saveTimeout = setTimeout(() => {
                handleAutosave();
            }, AUTOSAVE_DELAY);
        }

        // Keep frontmatter tags in sync regardless of autosave
        updateFrontmatterTags();
    });

    async function loadEntry() {
        if (!entryId || !storageService) return;

        // Don't reload entry content if a save is in progress to prevent race conditions
        if (saveInProgress) {
            return;
        }

    // Don't reload if user has unsaved changes (even when lastSavedContent is empty)
    if (content !== lastSavedContent) {
            return;
        }

        // Use preloaded entry if available (should be the common case)
        if (preloadedEntry && preloadedEntry.id === entryId) {
            entry = preloadedEntry;
            editableTitle = preloadedEntry.title;
            content = preloadedEntry.content;
            lastSavedContent = preloadedEntry.content; // Initialize lastSavedContent to prevent false autosave triggers

            // Get cached publish status from metadata store (no async call needed!)
            const metadata = $metadataStore.entries[entryId];
            isPublished = metadata?.isPublished || false;

            // Entry is locked only if it's published (from cloud) AND E2E encryption exists but is not unlocked
            if (
                isPublished &&
                e2eEncryptionService.hasStoredKeys() &&
                !e2eSession?.isUnlocked
            ) {
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
            // Don't overwrite content if save is in progress or if user has unsaved changes
            if (!saveInProgress && content === lastSavedContent) {
                content = rawEntry.content;
                lastSavedContent = rawEntry.content; // Initialize lastSavedContent to prevent false autosave triggers
            }

            // Get cached publish status from metadata store (no async call needed!)
            const metadata = $metadataStore.entries[entryId];
            isPublished = metadata?.isPublished || false;

            // Entry is locked only if it's published (from cloud) AND E2E encryption exists but is not unlocked
            if (
                isPublished &&
                e2eEncryptionService.hasStoredKeys() &&
                !e2eSession?.isUnlocked
            ) {
                isEntryLocked = true;
            } else {
                isEntryLocked = false;
            }
        } catch (error) {
            console.error("Failed to load entry:", error);
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
        saveStatus = "saving";

        try {
            // Save content as plain text (no encryption)
            const success = await storageService.saveEntry(
                entry.id,
                contentToSave,
            );

            if (success) {
                onsaved?.({ id: entry.id, content: contentToSave });
                entry.content = contentToSave;
                entry.modified_at = new Date().toISOString();
                lastSavedContent = contentToSave;
                saveStatus = "saved";

                // If authenticated and published, sync changes to cloud
                if (apiAuthService.isAuthenticated() && isPublished) {
                    await storageService.syncEntryToCloud(entry.id);
                }

                return true;
            } else {
                onerror?.({
                    title: "Save Failed",
                    message: "Failed to save entry. Please try again.",
                });
                saveStatus = "error";
                return false;
            }
        } catch (error) {
            console.error("Save error:", error);
            onerror?.({
                title: "Save Failed",
                message: "Failed to save entry. Please try again.",
            });
            saveStatus = "error";
            return false;
        } finally {
            saveInProgress = false;
        }
    }

    async function handleAutosave() {
        if (content === lastSavedContent) {
            saveStatus = "idle";
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
            const newId = await storageService.renameEntry(
                entryId,
                editableTitle.trim(),
            );
            if (newId) {
                onrenamed?.({ oldId: entryId, newId });
                isEditingTitle = false;
            } else {
                onerror?.({
                    title: "Rename Failed",
                    message: "Failed to rename entry. Please try again.",
                });
                editableTitle = entry.title; // Reset to original title
                isEditingTitle = false;
            }
        } catch (error) {
            console.error("Rename error:", error);
            onerror?.({
                title: "Rename Failed",
                message: "Failed to rename entry. Please try again.",
            });
            editableTitle = entry.title; // Reset to original title
            isEditingTitle = false;
        }
    }

    function handleTitleCancel() {
        editableTitle = entry?.title || "";
        isEditingTitle = false;
    }

    function handleTitleKeydown(event: KeyboardEvent) {
        if (event.key === "Enter") {
            event.preventDefault();
            handleTitleSave();
        } else if (event.key === "Escape") {
            event.preventDefault();
            handleTitleCancel();
        }
    }

    function handleTogglePublish() {
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
            const extractedTags = FrontmatterService.extractTags(
                parsedContent.frontmatter,
            );

            // Only update if tags have actually changed to avoid unnecessary re-renders
            if (!arraysEqual(frontmatterTags, extractedTags)) {
                frontmatterTags = extractedTags;
            }
        } catch (error) {
            console.warn("Failed to extract frontmatter tags:", error);
            frontmatterTags = [];
        }
    }

    // Component handler functions
    function handleTitleEdit() {
        if (!isEntryLocked) {
            isEditingTitle = true;
        }
    }

    function handleTextareaFocusChange() {
        textareaFocused = true;
        handleTextareaFocus(isMobile, $isKeyboardVisible, onkeyboardtoggle);
    }

    function handleTextareaBlurChange() {
        textareaFocused = false;
        handleTextareaBlur(isMobile, onkeyboardtoggle);
    }

    function handleTextareaInput() {
        // Mobile scroll handling is now done in EditorContent component
    }

    function handleTextareaClick() {
        // Mobile scroll handling is now done in EditorContent component
    }

    function handleTogglePreview() {
        if (!isEntryLocked) {
            isPreview = !isPreview;
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        // Handle keyboard shortcuts

        // Escape to close
        if (event.key === "Escape") {
            handleClose();
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
            title: "Unlock Required",
            message:
                "This entry requires E2E encryption to be unlocked. Please go to Settings to enter your encryption password.",
        });
    }

    // Removed old password prompt handlers - no longer needed with E2E encryption
</script>

<svelte:window onkeydown={handleKeydown} />

{#if entry}
    <div
        class="flex flex-col h-full bg-surface rounded-lg shadow-lg overflow-hidden"
    >
        <!-- Editor Header -->
        <EditorHeader
            {entry}
            {editableTitle}
            {isEditingTitle}
            {isEntryLocked}
            {canPublish}
            {isPublished}
            {isMobile}
            {isPreview}
            onTitleEdit={handleTitleEdit}
            onTitleSave={handleTitleSave}
            onTitleCancel={handleTitleCancel}
            onTitleKeydown={handleTitleKeydown}
            onClose={handleClose}
            onTogglePublish={handleTogglePublish}
            onShowInfo={handleShowInfo}
            onTogglePreview={handleTogglePreview}
        />

        <!-- Editor Content -->
        <EditorContent
            bind:content
            {isPreview}
            {isLoading}
            {isEntryLocked}
            {isMobile}
            {textareaFocused}
            onTextareaFocus={handleTextareaFocusChange}
            onTextareaBlur={handleTextareaBlurChange}
            onTextareaInput={handleTextareaInput}
            onTextareaClick={handleTextareaClick}
            onUnlockEntry={handleUnlockEntry}
            bind:textareaElement
        />

        <!-- Editor Footer -->
        <EditorFooter
            {entry}
            {content}
            {saveStatus}
            {canPublish}
            {isPublished}
            {isEntryLocked}
            {isMobile}
            isKeyboardVisible={$isKeyboardVisible}
            keyboardHeight={$keyboardHeight}
        />
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
<InfoModal {entry} isVisible={showInfo} onclose={handleCloseInfo} />

<!-- Publish Modal -->
<PublishModal
    isVisible={showTagSelector}
    {entry}
    {entryId}
    {selectedTagIds}
    {frontmatterTags}
    onTagSelectionChange={handleTagSelectionChange}
    onPublishWithTags={handlePublishWithTags}
    onCancel={handleCancelPublish}
/>

<style>
    /* Mobile responsive container */
    @media (max-width: 768px) {
        .flex.flex-col.h-full.bg-surface.rounded-lg.shadow-lg.overflow-hidden {
            height: 100%;
            border-radius: 0;
            box-shadow: none;
        }
    }
</style>
