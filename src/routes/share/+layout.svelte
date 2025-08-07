<script lang="ts">
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import type { Snippet } from 'svelte';

    interface Props {
        children: Snippet;
    }

    let { children }: Props = $props();

    // Import theme system but use minimal theming for public pages
    let isDarkMode = $state(false);

    onMount(() => {
        if (browser) {
            // Check system preference for dark mode
            isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
            
            // Listen for system theme changes
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = (e: MediaQueryListEvent) => {
                isDarkMode = e.matches;
            };
            
            mediaQuery.addEventListener('change', handleChange);
            
            // Apply theme
            applyTheme(isDarkMode);
            
            return () => {
                mediaQuery.removeEventListener('change', handleChange);
            };
        }
    });

    function applyTheme(dark: boolean) {
        if (!browser) return;
        
        const root = document.documentElement;
        
        if (dark) {
            // Dark theme colors
            root.style.setProperty('--color-primary', '#3b82f6');
            root.style.setProperty('--color-primaryHover', '#2563eb');
            root.style.setProperty('--color-primaryShadow', 'rgba(59, 130, 246, 0.2)');
            root.style.setProperty('--color-background', '#111827');
            root.style.setProperty('--color-surface', '#1f2937');
            root.style.setProperty('--color-text', '#f9fafb');
            root.style.setProperty('--color-textSecondary', '#9ca3af');
            root.style.setProperty('--color-border', '#374151');
        } else {
            // Light theme colors
            root.style.setProperty('--color-primary', '#3b82f6');
            root.style.setProperty('--color-primaryHover', '#2563eb');
            root.style.setProperty('--color-primaryShadow', 'rgba(59, 130, 246, 0.1)');
            root.style.setProperty('--color-background', '#f8fafc');
            root.style.setProperty('--color-surface', '#ffffff');
            root.style.setProperty('--color-text', '#1f2937');
            root.style.setProperty('--color-textSecondary', '#6b7280');
            root.style.setProperty('--color-border', '#e5e7eb');
        }
        
        root.setAttribute('data-theme', 'default');
        root.setAttribute('data-color-mode', dark ? 'dark' : 'light');
    }

    // React to dark mode changes
    $effect(() => {
        if (browser) {
            applyTheme(isDarkMode);
        }
    });
</script>

<svelte:head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<main class="share-layout">
    {@render children()}
</main>

<style>
    :global(html) {
        height: 100%;
    }
    
    :global(body) {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        height: 100%;
        background: var(--color-background);
        color: var(--color-text);
        line-height: 1.5;
    }

    :global(*) {
        box-sizing: border-box;
    }

    .share-layout {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    /* Global button styles */
    :global(.btn) {
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        text-decoration: none;
        font-size: 0.875rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: inherit;
    }

    :global(.btn-primary) {
        background: var(--color-primary);
        color: white;
    }

    :global(.btn-primary:hover) {
        background: var(--color-primaryHover);
        transform: translateY(-1px);
    }

    :global(.btn-secondary) {
        background: var(--color-border);
        color: var(--color-text);
    }

    :global(.btn-secondary:hover) {
        background: var(--color-textSecondary);
        color: white;
    }

    :global(.btn-outline) {
        background: transparent;
        color: var(--color-primary);
        border: 1px solid var(--color-primary);
    }

    :global(.btn-outline:hover) {
        background: var(--color-primary);
        color: white;
    }

    /* Ensure proper font rendering */
    :global(body) {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
</style>