<script lang="ts">
    import { type JournalEntry } from "../storage/index";
    import {
        FrontmatterService,
        type ParsedContent,
    } from "../storage/frontmatter.service";
    import { detectTauri } from '../utils/tauri.js';
    import { save } from '@tauri-apps/plugin-dialog';
    import { writeTextFile } from '@tauri-apps/plugin-fs';

    interface Props {
        entry: JournalEntry | null;
        isVisible: boolean;
        onclose?: () => void;
    }

    let { entry, isVisible, onclose }: Props = $props();

    // Parse frontmatter when entry changes - compute values directly
    let parsedContent = $derived(
        entry ? FrontmatterService.parseContent(entry.content) : null,
    );

    let wordCount = $derived.by(() => {
        if (!parsedContent) return 0;
        const contentOnly = parsedContent.content.trim();
        return contentOnly
            ? contentOnly.split(/\s+/).filter((w) => w.length > 0).length
            : 0;
    });

    let characterCount = $derived.by(() => {
        if (!parsedContent) return 0;
        return parsedContent.content.trim().length;
    });

    function handleClose() {
        console.log("InfoModal: handleClose called");
        onclose?.();
    }

    function handleBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            handleClose();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
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

    // Export functionality
    function generateFilename(entry: JournalEntry): string {
        // Use entry ID as base filename, replace invalid characters
        const safeId = entry.id.replace(/[^a-zA-Z0-9-_]/g, "-");
        return `${safeId}.md`;
    }

    async function exportAsMarkdown() {
        if (!entry) return;

        const filename = generateFilename(entry);
        const content = entry.content;
        const isTauri = detectTauri();

        try {
            if (isTauri) {
                // Tauri environment - use save dialog
                const filePath = await save({
                    filters: [
                        {
                            name: 'Markdown',
                            extensions: ['md'],
                        },
                    ],
                    defaultPath: filename,
                });

                if (filePath) {
                    await writeTextFile(filePath, content);
                    console.log(`Exported entry "${entry.title}" to ${filePath}`);
                }
            } else {
                // Web environment - use blob download
                const blob = new Blob([content], {
                    type: "text/markdown;charset=utf-8",
                });

                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = filename;

                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                URL.revokeObjectURL(url);
                console.log(`Exported entry "${entry.title}" as ${filename}`);
            }
        } catch (error) {
            console.error('Export failed:', error);
            // TODO: Show user-friendly error message
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isVisible && entry}
    <div
        class="modal-overlay"
        role="button"
        tabindex="0"
        onclick={handleBackdropClick}
        onkeydown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") handleBackdropClick();
        }}
    >
        <div class="modal-content modal-medium">
            <div class="modal-header">
                <h2>Entry Information</h2>
                <button class="close-btn" onclick={handleClose} title="Close">
                    ×
                </button>
            </div>

            <div class="modal-body">
                <!-- Basic Entry Info -->
                <section class="form-section">
                    <h3>Basic Information</h3>
                    <div class="grid grid-cols-1 gap-3">
                        <div class="flex justify-between">
                            <span class="font-medium text-secondary">Title:</span>
                            <span class="text-right">{entry.title}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="font-medium text-secondary">Created:</span>
                            <span class="text-right text-sm"
                                >{new Date(
                                    entry.created_at,
                                ).toLocaleString()}</span
                            >
                        </div>
                        <div class="flex justify-between">
                            <span class="font-medium text-secondary">Modified:</span>
                            <span class="text-right text-sm"
                                >{new Date(
                                    entry.modified_at,
                                ).toLocaleString()}</span
                            >
                        </div>
                        <div class="flex justify-between">
                            <span class="font-medium text-secondary">File Path:</span>
                            <span class="text-right text-sm font-mono truncate max-w-xs"
                                >{entry.file_path || "N/A"}</span
                            >
                        </div>
                    </div>
                </section>

                <!-- Content Statistics -->
                <section class="form-section">
                    <h3>Content Statistics</h3>
                    <div class="grid grid-cols-1 gap-3">
                        <div class="flex justify-between">
                            <span class="font-medium text-secondary">Word Count:</span>
                            <span class="text-right font-mono"
                                >{wordCount.toLocaleString()}</span
                            >
                        </div>
                        <div class="flex justify-between">
                            <span class="font-medium text-secondary">Character Count:</span>
                            <span class="text-right font-mono"
                                >{characterCount.toLocaleString()}</span
                            >
                        </div>
                        <div class="flex justify-between">
                            <span class="font-medium text-secondary">Has Frontmatter:</span>
                            <span class="text-right"
                                >{parsedContent?.hasFrontmatter
                                    ? "Yes"
                                    : "No"}</span
                            >
                        </div>
                    </div>
                </section>

                <!-- Tags Section -->
                {#if tags.length > 0}
                    <section class="form-section">
                        <h3>Tags</h3>
                        <div class="flex flex-wrap gap-2">
                            {#each tags as tag}
                                <span class="px-2 py-1 bg-accent text-sm rounded border">{tag}</span>
                            {/each}
                        </div>
                    </section>
                {/if}

                <!-- Frontmatter Metadata -->
                {#if metadataInfo.length > 0}
                    <section class="form-section">
                        <h3>Frontmatter Metadata</h3>
                        <div class="grid grid-cols-1 gap-3">
                            {#each metadataInfo as meta}
                                <div class="flex justify-between">
                                    <span class="font-medium text-secondary">{meta.key}:</span>
                                    <span
                                        class="text-right text-sm"
                                        class:font-mono={meta.type === "array"}
                                    >
                                        {meta.value}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}

                <!-- Raw Frontmatter (for debugging) -->
                {#if parsedContent?.hasFrontmatter && Object.keys(parsedContent.frontmatter).length > 0}
                    <section class="form-section">
                        <h3>Raw Frontmatter</h3>
                        <pre class="bg-background p-3 rounded text-sm font-mono overflow-x-auto">{JSON.stringify(
                                parsedContent.frontmatter,
                                null,
                                2,
                            )}</pre>
                    </section>
                {/if}
            </div>

            <div class="modal-footer">
                <button
                    class="btn btn-primary"
                    onclick={exportAsMarkdown}
                    title="Export this entry as a Markdown file"
                >
                    <img
                        src="/material-symbols--download.svg"
                        alt="Export"
                        class="icon"
                    />
                    Export as Markdown
                </button>
                <button class="btn btn-secondary" onclick={handleClose}>
                    Close
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Component-specific styles that can't be replaced with utility classes - InfoModal uses extracted styles */
</style>
