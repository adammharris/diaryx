<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { currentTheme, themes, setTheme } from '../stores/theme.js';
    import { storage } from '../storage.js';

    const dispatch = createEventDispatcher<{
        close: {};
    }>();

    let selectedTheme = $currentTheme;
    let isTauri = false;

    onMount(() => {
        // Get initial detection
        isTauri = storage.isRunningInTauri;
        
        // Refresh detection after a short delay in case Tauri takes time to load
        setTimeout(() => {
            storage.refreshTauriDetection();
            isTauri = storage.isRunningInTauri;
        }, 200);
    });

    function handleThemeChange(themeName: string) {
        selectedTheme = themeName;
        setTheme(themeName);
    }

    function handleClose() {
        dispatch('close', {});
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            handleClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
    class="settings-overlay" 
    onclick={handleClose}
    role="presentation"
>
    <div 
        class="settings-modal" 
        onclick={(e: Event) => e.stopPropagation()}
        onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex="-1"
    >
        <div class="settings-header">
            <h2 class="settings-title">Settings</h2>
            <button class="close-btn" onclick={handleClose} aria-label="Close settings">
                ✕
            </button>
        </div>

        <div class="settings-content">
            <div class="setting-section">
                <h3 class="section-title">Appearance</h3>
                <p class="section-description">Choose a color theme for the interface</p>

                <div class="theme-grid">
                    {#each Object.entries(themes) as [key, theme] (key)}
                        <button
                            class="theme-option"
                            class:selected={selectedTheme === key}
                            onclick={() => handleThemeChange(key)}
                        >
                            <div 
                                class="theme-preview" 
                                style="background: {theme.colors.gradient}"
                            ></div>
                            <div class="theme-colors">
                                <div 
                                    class="color-dot" 
                                    style="background-color: {theme.colors.primary}"
                                ></div>
                                <div 
                                    class="color-dot" 
                                    style="background-color: {theme.colors.accent}"
                                ></div>
                                <div 
                                    class="color-dot" 
                                    style="background-color: {theme.colors.surface}"
                                ></div>
                            </div>
                            <span class="theme-name">{theme.name}</span>
                        </button>
                    {/each}
                </div>
            </div>

            <div class="setting-section">
                <h3 class="section-title">About</h3>
                <p class="about-text">
                    Diaryx - Personal Journal<br>
                    A beautiful journaling app built with Tauri and Svelte.<br>
                    <br>
                    <strong>Mode:</strong> {isTauri ? 'Desktop (Tauri)' : 'Web Browser'}<br>
                    <strong>Storage:</strong> {isTauri ? 'Files + IndexedDB' : 'IndexedDB only'}<br>
                    {#if isTauri}
                        <strong>Location:</strong> ~/Documents/Diaryx/entries/
                    {:else}
                        <em>Note: In web mode, entries are stored locally in your browser's database.</em>
                    {/if}
                </p>
            </div>
        </div>
    </div>
</div>

<style>
    .settings-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
    }

    .settings-modal {
        background: var(--color-surface, white);
        border-radius: 12px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        background: var(--color-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
        color: white;
        border-radius: 12px 12px 0 0;
    }

    .settings-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
    }

    .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 6px;
        transition: background-color 0.2s ease;
        line-height: 1;
    }

    .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .settings-content {
        padding: 1.5rem;
    }

    .setting-section {
        margin-bottom: 2rem;
    }

    .setting-section:last-child {
        margin-bottom: 0;
    }

    .section-title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text, #1f2937);
        margin: 0 0 0.5rem 0;
    }

    .section-description {
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.875rem;
        margin: 0 0 1rem 0;
    }

    .theme-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
    }

    .theme-option {
        background: var(--color-surface, white);
        border: 2px solid var(--color-border, #e5e7eb);
        border-radius: 8px;
        padding: 1rem;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
    }

    .theme-option:hover {
        border-color: var(--color-primary, #3b82f6);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .theme-option.selected {
        border-color: var(--color-primary, #3b82f6);
        background: var(--color-background, #f8fafc);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .theme-preview {
        width: 100%;
        height: 40px;
        border-radius: 6px;
        margin-bottom: 0.25rem;
    }

    .theme-colors {
        display: flex;
        gap: 0.25rem;
    }

    .color-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .theme-name {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text, #1f2937);
        text-align: center;
    }

    .about-text {
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0;
    }

    @media (max-width: 640px) {
        .settings-modal {
            width: 95%;
            margin: 1rem;
        }

        .theme-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
</style>
