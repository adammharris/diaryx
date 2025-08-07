<script lang="ts">
    import SvelteMarkdown from 'svelte-markdown';
    import type { EditorContentProps } from './editor-types';
    import { scrollToCursor } from './mobile-utils';

    let { 
        content,
        isPreview,
        isLoading,
        isEntryLocked,
        isMobile,
        textareaFocused,
        onContentChange,
        onTextareaFocus,
        onTextareaBlur,
        onTextareaInput,
        onTextareaClick,
        onUnlockEntry,
        textareaElement = $bindable()
    }: EditorContentProps = $props();

    function handleContentChange(event: Event) {
        const target = event.target as HTMLTextAreaElement;
        onContentChange(target.value);
    }

    function handleTextareaFocus(event: FocusEvent) {
        const target = event.target as HTMLTextAreaElement;
        textareaElement = target;
        onTextareaFocus();
    }

    function handleTextareaBlur() {
        onTextareaBlur();
    }

    function handleTextareaInput() {
        if (isMobile && textareaFocused && textareaElement) {
            scrollToCursor(textareaElement, content);
        }
        onTextareaInput();
    }

    function handleTextareaClick() {
        if (isMobile && textareaElement) {
            // Small delay to allow selection to update
            setTimeout(() => {
                if (textareaElement) {
                    scrollToCursor(textareaElement, content);
                }
            }, 50);
        }
        onTextareaClick();
    }

    function handleUnlockClick() {
        onUnlockEntry();
    }
</script>

<div class="editor-content">
    {#if isLoading}
        <div class="loading-state">
            <div class="spinner"></div>
            <span class="loading-text">Loading...</span>
        </div>
    {:else if isEntryLocked}
        <div class="locked-state">
            <div class="lock-icon-container">
                <img src="/material-symbols--lock.svg" class="lock-icon" alt="Locked" />
            </div>
            <h3 class="locked-title">Entry is Encrypted</h3>
            <p class="locked-description">This entry is encrypted and requires a password to view or edit.</p>
            <button 
                class="btn btn-unlock-large"
                onclick={handleUnlockClick}
                type="button"
            >
                <img src="/material-symbols--lock-open-right.svg" class="icon" alt="Unlock" />
                Unlock Entry
            </button>
        </div>
    {:else if isPreview}
        <div class="preview-container">
            <SvelteMarkdown source={content} />
        </div>
    {:else}
        <textarea
            bind:this={textareaElement}
            class="content-textarea"
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

<style>
    .editor-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        gap: 1rem;
    }

    .spinner {
        width: 24px;
        height: 24px;
        border: 2px solid var(--color-border);
        border-top: 2px solid var(--color-primary, #3b82f6);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .loading-text {
        color: var(--color-textSecondary);
        font-size: 0.875rem;
    }

    .locked-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        text-align: center;
        gap: 1.5rem;
    }

    .lock-icon-container {
        margin-bottom: 1rem;
    }

    .lock-icon {
        width: 48px;
        height: 48px;
        filter: var(--color-icon-filter);
        opacity: 0.5;
    }

    .locked-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text);
        margin: 0;
    }

    .locked-description {
        color: var(--color-textSecondary);
        line-height: 1.5;
        margin: 0 0 1.5rem 0;
        max-width: 400px;
    }

    .btn-unlock-large {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1.5rem;
        font-size: 1rem;
        font-weight: 500;
    }

    .btn-unlock-large .icon {
        width: 16px;
        height: 16px;
        filter: var(--color-icon-filter);
    }

    .preview-container {
        padding: 1.5rem;
        overflow-y: auto;
        flex: 1;
        -webkit-overflow-scrolling: touch;
    }

    .content-textarea {
        width: 100%;
        flex: 1;
        padding: 1.5rem;
        border: none;
        resize: none;
        font-family: 'SF Mono', 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace;
        font-size: 0.875rem;
        line-height: 1.6;
        background: var(--color-surface);
        color: var(--color-text);
        outline: none;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
    }

    .content-textarea:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .content-textarea::placeholder {
        color: var(--color-textSecondary);
        opacity: 0.7;
    }

    /* Markdown preview styling */
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
        line-height: 1.7;
    }

    .preview-container :global(ul),
    .preview-container :global(ol) {
        margin-bottom: 1rem;
        padding-left: 1.5rem;
    }

    .preview-container :global(li) {
        margin-bottom: 0.25rem;
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

    .preview-container :global(table) {
        width: 100%;
        border-collapse: collapse;
        margin: 1rem 0;
    }

    .preview-container :global(th),
    .preview-container :global(td) {
        border: 1px solid var(--color-border);
        padding: 0.5rem;
        text-align: left;
    }

    .preview-container :global(th) {
        background: var(--color-background);
        font-weight: 600;
    }

    /* Mobile responsive adjustments */
    @media (max-width: 768px) {
        .content-textarea {
            padding: 1rem;
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            padding-bottom: 2rem;
            font-size: 1rem;
            line-height: 1.6;
        }

        .preview-container {
            padding: 1rem;
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            padding-bottom: 2rem;
        }

        .locked-state {
            padding: 2rem 1rem;
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
        }

        .loading-state {
            padding: 2rem 1rem;
        }
    }

    /* Very small screens */
    @media (max-width: 480px) {
        .locked-state {
            gap: 1rem;
        }

        .lock-icon {
            width: 36px;
            height: 36px;
        }

        .locked-title {
            font-size: 1.125rem;
        }

        .locked-description {
            font-size: 0.875rem;
        }

        .btn-unlock-large {
            padding: 0.625rem 1.25rem;
            font-size: 0.875rem;
        }
    }
</style>