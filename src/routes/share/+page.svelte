<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import SvelteMarkdown from 'svelte-markdown';
    import { browser } from '$app/environment';
    import { e2eEncryptionService } from '$lib/services/e2e-encryption.service.js';
    import { VITE_API_BASE_URL } from '$lib/config/env-validation.js';

    // Parse query parameter for entry data
    let shareData = $state<{entryId: string, keyData: any} | null>(null);
    
    // State management
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let entry = $state<any>(null);
    let decryptedContent = $state('');
    let isDecrypting = $state(false);
    let decryptionError = $state<string | null>(null);

    onMount(async () => {
        if (!browser) return;
        
        try {
            // Parse the 'q' query parameter which contains encoded share data
            const queryParam = $page.url.searchParams.get('q');
            if (!queryParam) {
                error = 'No share data found in URL. Please use the complete shareable link.';
                isLoading = false;
                return;
            }

            // Decode the share data
            const shareDataJson = atob(queryParam.replace(/-/g, '+').replace(/_/g, '/'));
            const parsedData = JSON.parse(shareDataJson);
            
            if (!parsedData.entryId || !parsedData.keyData) {
                error = 'Invalid share data format. Please check the shareable link.';
                isLoading = false;
                return;
            }
            
            shareData = parsedData;
            console.log('Parsed share data from query parameter');
        } catch (err) {
            console.error('Failed to parse share data from URL:', err);
            error = 'Invalid share data in URL. Please check the shareable link.';
            isLoading = false;
            return;
        }

        // Load the entry
        await loadEntry();
    });

    async function loadEntry() {
        if (!shareData) {
            error = 'No share data available';
            isLoading = false;
            return;
        }

        try {
            isLoading = true;
            error = null;

            // Fetch entry from public API (no authentication required)
            const response = await fetch(`${VITE_API_BASE_URL}/entries/public/${shareData.entryId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Entry not found or not available for public viewing');
                } else if (response.status === 403) {
                    throw new Error('This entry is not available for public viewing');
                } else {
                    throw new Error(`Failed to load entry: ${response.statusText}`);
                }
            }

            const result = await response.json();
            
            if (result.success) {
                entry = result.data;
                console.log('Loaded public entry:', entry.id);
                
                // Decrypt the content
                await decryptEntry();
            } else {
                throw new Error(result.error || 'Failed to load entry');
            }
        } catch (err) {
            console.error('Failed to load entry:', err);
            error = err instanceof Error ? err.message : 'Failed to load entry';
        } finally {
            isLoading = false;
        }
    }

    async function decryptEntry() {
        if (!entry || !shareData?.keyData) {
            decryptionError = 'Missing entry data or encryption key';
            return;
        }

        try {
            isDecrypting = true;
            decryptionError = null;

            // Prepare encryption data for decryption
            const encryptedData = {
                encryptedContentB64: entry.encrypted_content,
                contentNonceB64: entry.encryption_metadata?.contentNonceB64,
                encryptedEntryKeyB64: shareData.keyData.encryptedKey,
                keyNonceB64: shareData.keyData.nonce
            };

            console.log('Attempting to decrypt entry with shared key data');
            
            // Decrypt using the E2E encryption service
            const decryptedEntry = e2eEncryptionService.decryptEntry(encryptedData, shareData.keyData.authorPublicKey);
            
            if (decryptedEntry) {
                decryptedContent = decryptedEntry.content || 'No content available';
                console.log('Successfully decrypted shared entry');
            } else {
                throw new Error('Decryption failed - unable to decrypt content');
            }
        } catch (err) {
            console.error('Failed to decrypt entry:', err);
            decryptionError = err instanceof Error ? err.message : 'Failed to decrypt content';
            decryptedContent = 'Unable to decrypt content. Please check that you have the correct shareable link.';
        } finally {
            isDecrypting = false;
        }
    }

    function handleGoHome() {
        goto('/');
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getAuthorName(entry: any): string {
        // Backend returns flat fields: author_display_name, author_name, author_username
        return entry.author?.display_name || entry.author?.name || entry.author?.username || 
               entry.author_display_name || entry.author_name || entry.author_username || 'Unknown Author';
    }

    function getTags(entry: any): string[] {
        if (!entry.tags || !Array.isArray(entry.tags)) return [];
        return entry.tags.map((tag: any) => tag?.name || 'Unknown Tag');
    }
</script>

<svelte:head>
    <title>{entry ? `${entry.title || 'Shared Entry'} - Diaryx` : 'Shared Entry - Diaryx'}</title>
    <meta name="description" content={entry ? `Shared entry: ${entry.title || 'Untitled'}` : 'View a shared journal entry'} />
</svelte:head>

<div class="public-viewer">
    <div class="viewer-header">
        <div class="header-content">
            <div class="app-branding">
                <h1 class="app-title">📖 Diaryx</h1>
                <p class="app-subtitle">Shared Entry</p>
            </div>
            <button 
                class="home-btn"
                onclick={handleGoHome}
                title="Go to Diaryx App"
            >
                🏠 Open App
            </button>
        </div>
    </div>

    <div class="viewer-content">
        {#if isLoading}
            <div class="loading-state">
                <div class="spinner"></div>
                <h2>Loading shared entry...</h2>
                <p>Fetching and decrypting content</p>
            </div>
        {:else if error}
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h2>Unable to Load Entry</h2>
                <p class="error-message">{error}</p>
                <div class="error-actions">
                    <button class="btn btn-primary" onclick={handleGoHome}>
                        Go to Diaryx App
                    </button>
                    <button class="btn btn-secondary" onclick={() => window.location.reload()}>
                        Try Again
                    </button>
                </div>
            </div>
        {:else if entry}
            <article class="entry-article">
                <header class="entry-header">
                    <h1 class="entry-title">{entry.title || 'Untitled Entry'}</h1>
                    <div class="entry-meta">
                        <div class="meta-item">
                            <span class="meta-label">Shared by:</span>
                            <span class="meta-value">{getAuthorName(entry)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Date:</span>
                            <span class="meta-value">{formatDate(entry.updated_at || entry.created_at)}</span>
                        </div>
                    </div>
                    {#if getTags(entry).length > 0}
                        <div class="entry-tags">
                            {#each getTags(entry) as tag}
                                <span class="tag">#{tag}</span>
                            {/each}
                        </div>
                    {/if}
                </header>

                <div class="entry-content">
                    {#if isDecrypting}
                        <div class="decrypting-state">
                            <div class="spinner small"></div>
                            <p>Decrypting content...</p>
                        </div>
                    {:else if decryptionError}
                        <div class="decryption-error">
                            <div class="error-icon">🔒</div>
                            <h3>Decryption Failed</h3>
                            <p>{decryptionError}</p>
                            <button class="btn btn-secondary" onclick={decryptEntry}>
                                Try Again
                            </button>
                        </div>
                    {:else}
                        <div class="markdown-content">
                            <SvelteMarkdown source={decryptedContent} />
                        </div>
                    {/if}
                </div>
            </article>
        {/if}
    </div>

    <div class="viewer-footer">
        <div class="footer-content">
            <p class="footer-text">
                This entry was shared securely using 
                <a href="/" class="app-link">Diaryx</a> - 
                a personal journal application with end-to-end encryption.
            </p>
            <div class="footer-actions">
                <button class="btn btn-outline" onclick={handleGoHome}>
                    Create Your Own Journal
                </button>
            </div>
        </div>
    </div>
</div>

<style>
    .public-viewer {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: var(--color-background, #f8fafc);
        color: var(--color-text, #1f2937);
    }

    .viewer-header {
        background: var(--color-surface, #ffffff);
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        padding: 1rem 0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .header-content {
        max-width: 800px;
        margin: 0 auto;
        padding: 0 1.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .app-branding {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .app-title {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-primary, #3b82f6);
    }

    .app-subtitle {
        margin: 0;
        font-size: 0.875rem;
        color: var(--color-textSecondary, #6b7280);
        font-weight: 500;
    }

    .home-btn {
        background: var(--color-primary, #3b82f6);
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        text-decoration: none;
        font-size: 0.875rem;
    }

    .home-btn:hover {
        background: var(--color-primaryHover, #2563eb);
        transform: translateY(-1px);
    }

    .viewer-content {
        flex: 1;
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem 1.5rem;
        width: 100%;
    }

    .loading-state,
    .error-state {
        text-align: center;
        padding: 4rem 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .loading-state h2,
    .error-state h2 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text, #1f2937);
    }

    .loading-state p,
    .error-state .error-message {
        margin: 0;
        color: var(--color-textSecondary, #6b7280);
        font-size: 1rem;
    }

    .error-icon {
        font-size: 3rem;
    }

    .error-actions {
        display: flex;
        gap: 1rem;
        margin-top: 1rem;
    }

    .spinner {
        width: 3rem;
        height: 3rem;
        border: 3px solid var(--color-border, #e5e7eb);
        border-top: 3px solid var(--color-primary, #3b82f6);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    .spinner.small {
        width: 1.5rem;
        height: 1.5rem;
        border-width: 2px;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .entry-article {
        background: var(--color-surface, #ffffff);
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        overflow: hidden;
    }

    .entry-header {
        padding: 2rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        background: var(--color-background, #f8fafc);
    }

    .entry-title {
        margin: 0 0 1rem 0;
        font-size: 2rem;
        font-weight: 700;
        color: var(--color-text, #1f2937);
        line-height: 1.2;
    }

    .entry-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
        margin-bottom: 1rem;
    }

    .meta-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
    }

    .meta-label {
        font-weight: 500;
        color: var(--color-textSecondary, #6b7280);
    }

    .meta-value {
        color: var(--color-text, #1f2937);
    }

    .entry-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .tag {
        background: var(--color-primary, #3b82f6);
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 500;
    }

    .entry-content {
        padding: 2rem;
        min-height: 200px;
    }

    .decrypting-state,
    .decryption-error {
        text-align: center;
        padding: 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .decryption-error h3 {
        margin: 0;
        font-size: 1.25rem;
        color: var(--color-text, #1f2937);
    }

    .decryption-error p {
        margin: 0;
        color: var(--color-textSecondary, #6b7280);
    }

    .markdown-content {
        line-height: 1.7;
        color: var(--color-text, #1f2937);
        font-size: 1rem;
    }

    .markdown-content :global(h1),
    .markdown-content :global(h2),
    .markdown-content :global(h3),
    .markdown-content :global(h4),
    .markdown-content :global(h5),
    .markdown-content :global(h6) {
        margin: 2rem 0 1rem 0;
        color: var(--color-text, #1f2937);
        font-weight: 600;
        line-height: 1.3;
    }

    .markdown-content :global(h1) { font-size: 1.75rem; }
    .markdown-content :global(h2) { font-size: 1.5rem; }
    .markdown-content :global(h3) { font-size: 1.25rem; }

    .markdown-content :global(p) {
        margin: 0 0 1.5rem 0;
    }

    .markdown-content :global(ul),
    .markdown-content :global(ol) {
        margin: 0 0 1.5rem 0;
        padding-left: 1.5rem;
    }

    .markdown-content :global(li) {
        margin: 0.5rem 0;
    }

    .markdown-content :global(blockquote) {
        margin: 1.5rem 0;
        padding: 1rem 1.5rem;
        border-left: 4px solid var(--color-primary, #3b82f6);
        background: var(--color-background, #f8fafc);
        font-style: italic;
        border-radius: 0 6px 6px 0;
    }

    .markdown-content :global(code) {
        background: var(--color-background, #f8fafc);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 0.875em;
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .markdown-content :global(pre) {
        background: var(--color-background, #f8fafc);
        padding: 1.5rem;
        border-radius: 8px;
        overflow-x: auto;
        margin: 1.5rem 0;
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .markdown-content :global(pre code) {
        background: none;
        padding: 0;
        border: none;
    }

    .viewer-footer {
        background: var(--color-surface, #ffffff);
        border-top: 1px solid var(--color-border, #e5e7eb);
        margin-top: auto;
    }

    .footer-content {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem 1.5rem;
        text-align: center;
    }

    .footer-text {
        margin: 0 0 1.5rem 0;
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.875rem;
        line-height: 1.5;
    }

    .app-link {
        color: var(--color-primary, #3b82f6);
        text-decoration: none;
        font-weight: 500;
    }

    .app-link:hover {
        text-decoration: underline;
    }

    .footer-actions {
        display: flex;
        justify-content: center;
    }

    .btn {
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
    }

    .btn-primary {
        background: var(--color-primary, #3b82f6);
        color: white;
    }

    .btn-primary:hover {
        background: var(--color-primaryHover, #2563eb);
        transform: translateY(-1px);
    }

    .btn-secondary {
        background: var(--color-border, #e5e7eb);
        color: var(--color-text, #1f2937);
    }

    .btn-secondary:hover {
        background: var(--color-textSecondary, #6b7280);
        color: white;
    }

    .btn-outline {
        background: transparent;
        color: var(--color-primary, #3b82f6);
        border: 1px solid var(--color-primary, #3b82f6);
    }

    .btn-outline:hover {
        background: var(--color-primary, #3b82f6);
        color: white;
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
        .header-content {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
        }

        .viewer-content {
            padding: 1rem;
        }

        .entry-header {
            padding: 1.5rem;
        }

        .entry-title {
            font-size: 1.5rem;
        }

        .entry-meta {
            flex-direction: column;
            gap: 0.75rem;
        }

        .entry-content {
            padding: 1.5rem;
        }

        .footer-content {
            padding: 1.5rem;
        }

        .error-actions {
            flex-direction: column;
            align-items: center;
        }
    }
</style>