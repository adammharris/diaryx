<script lang="ts">
    import { type JournalEntry } from '../storage/index';
    import { FrontmatterService, type ParsedContent } from '../storage/frontmatter.service';

    interface Props {
        entry: JournalEntry | null;
        isVisible: boolean;
        onclose?: () => void;
    }

    let { entry, isVisible, onclose }: Props = $props();

    // Parse frontmatter when entry changes - compute values directly
    let parsedContent = $derived(entry ? FrontmatterService.parseContent(entry.content) : null);

    let wordCount = $derived.by(() => {
        if (!parsedContent) return 0;
        const contentOnly = parsedContent.content.trim();
        return contentOnly ? contentOnly.split(/\s+/).filter(w => w.length > 0).length : 0;
    });

    let characterCount = $derived.by(() => {
        if (!parsedContent) return 0;
        return parsedContent.content.trim().length;
    });

    function handleClose() {
        console.log('InfoModal: handleClose called');
        onclose?.();
    }

    function handleBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            handleClose();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            handleClose();
        }
    }

    // Get formatted metadata for display
    let metadataInfo = $derived.by(() => {
        if (!parsedContent || !parsedContent.hasFrontmatter) {
            return [];
        }
        return FrontmatterService.getMetadataInfo(parsedContent.frontmatter);
    });

    // Get tags specifically for better display
    let tags = $derived.by(() => {
        if (!parsedContent) return [];
        return FrontmatterService.extractTags(parsedContent.frontmatter);
    });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isVisible && entry}
    <div class="modal-backdrop" onclick={handleBackdropClick}>
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Entry Information</h2>
                <button class="close-btn" onclick={handleClose} title="Close">
                    ×
                </button>
            </div>

            <div class="modal-body">
                <!-- Basic Entry Info -->
                <section class="info-section">
                    <h3>Basic Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Title:</span>
                            <span class="info-value">{entry.title}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Created:</span>
                            <span class="info-value">{new Date(entry.created_at).toLocaleString()}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Modified:</span>
                            <span class="info-value">{new Date(entry.modified_at).toLocaleString()}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">File Path:</span>
                            <span class="info-value file-path">{entry.file_path || 'N/A'}</span>
                        </div>
                    </div>
                </section>

                <!-- Content Statistics -->
                <section class="info-section">
                    <h3>Content Statistics</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Word Count:</span>
                            <span class="info-value">{wordCount.toLocaleString()}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Character Count:</span>
                            <span class="info-value">{characterCount.toLocaleString()}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Has Frontmatter:</span>
                            <span class="info-value">{parsedContent?.hasFrontmatter ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                </section>

                <!-- Tags Section -->
                {#if tags.length > 0}
                    <section class="info-section">
                        <h3>Tags</h3>
                        <div class="tags-container">
                            {#each tags as tag}
                                <span class="tag">{tag}</span>
                            {/each}
                        </div>
                    </section>
                {/if}

                <!-- Frontmatter Metadata -->
                {#if metadataInfo.length > 0}
                    <section class="info-section">
                        <h3>Frontmatter Metadata</h3>
                        <div class="info-grid">
                            {#each metadataInfo as meta}
                                <div class="info-item">
                                    <span class="info-label">{meta.key}:</span>
                                    <span class="info-value" class:array-value={meta.type === 'array'}>
                                        {meta.value}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}

                <!-- Raw Frontmatter (for debugging) -->
                {#if parsedContent?.hasFrontmatter && Object.keys(parsedContent.frontmatter).length > 0}
                    <section class="info-section">
                        <h3>Raw Frontmatter</h3>
                        <pre class="raw-frontmatter">{JSON.stringify(parsedContent.frontmatter, null, 2)}</pre>
                    </section>
                {/if}
            </div>

            <div class="modal-footer">
                <button class="btn btn-secondary" onclick={handleClose}>
                    Close
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
        padding: 1rem;
    }

    .modal-content {
        background: white;
        border-radius: 12px;
        max-width: 600px;
        width: 100%;
        max-height: 90vh;
        overflow: hidden;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid #e5e7eb;
        background: #f9fafb;
    }

    .modal-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        color: #6b7280;
        transition: background-color 0.2s ease;
    }

    .close-btn:hover {
        background: #f3f4f6;
        color: #374151;
    }

    .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
    }

    .info-section {
        margin-bottom: 2rem;
    }

    .info-section:last-child {
        margin-bottom: 0;
    }

    .info-section h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: #374151;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 0.5rem;
    }

    .info-grid {
        display: grid;
        gap: 0.75rem;
    }

    .info-item {
        display: grid;
        grid-template-columns: 1fr 2fr;
        gap: 1rem;
        align-items: start;
    }

    .info-label {
        font-weight: 500;
        color: #6b7280;
    }

    .info-value {
        color: #1f2937;
        word-break: break-word;
    }

    .file-path {
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: 0.875rem;
        color: #4b5563;
    }

    .array-value {
        font-style: italic;
        color: #059669;
    }

    .tags-container {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .tag {
        background: #dbeafe;
        color: #1e40af;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 500;
    }

    .raw-frontmatter {
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 1rem;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: 0.875rem;
        color: #374151;
        overflow-x: auto;
        margin: 0;
    }

    .modal-footer {
        padding: 1.5rem;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
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
        background: white;
        color: #374151;
        border-color: #d1d5db;
    }

    .btn-secondary:hover {
        background: #f9fafb;
        border-color: #9ca3af;
    }

    /* Mobile responsiveness */
    @media (max-width: 768px) {
        .modal-backdrop {
            padding: 0;
        }

        .modal-content {
            max-height: 100vh;
            border-radius: 0;
            width: 100%;
            height: 100%;
        }

        .info-item {
            grid-template-columns: 1fr;
            gap: 0.25rem;
        }

        .info-label {
            font-size: 0.875rem;
        }

        .modal-body {
            padding: 1rem;
        }

        .modal-header,
        .modal-footer {
            padding: 1rem;
        }
    }
</style>