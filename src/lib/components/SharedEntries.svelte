<script lang="ts">
    import { onMount } from 'svelte';
    import { entrySharingService } from '../services/entry-sharing.service.js';
    import { apiAuthService, apiAuthStore } from '../services/api-auth.service.js';
    import { e2eEncryptionService, e2eSessionStore } from '../services/e2e-encryption.service.js';
    import EntryCard from './EntryCard.svelte';
    import type { JournalEntry } from '../storage/types.js';

    interface Props {
        onclose?: () => void;
    }

    let { onclose }: Props = $props();

    let sharedEntries = $state<JournalEntry[]>([]);
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let selectedEntryId = $state<string | null>(null);
    let searchQuery = $state('');

    // Reactive state for authentication and encryption
    let authSession = $derived($apiAuthStore);
    let e2eSession = $derived($e2eSessionStore);
    let canViewShared = $derived.by(() => {
        const auth = authSession?.isAuthenticated;
        const e2e = e2eSession?.isUnlocked;
        return auth && e2e;
    });

    // Filtered entries based on search
    let filteredEntries = $derived(
        sharedEntries.filter(entry => 
            entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            entry.preview.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    onMount(() => {
        loadSharedEntries();
    });

    async function loadSharedEntries() {
        if (!canViewShared) {
            error = 'Please sign in and unlock encryption to view shared entries.';
            isLoading = false;
            return;
        }

        try {
            isLoading = true;
            error = null;
            
            // Fetch shared entries from the API
            const result = await sharingService.getSharedEntries();
            
            if (result.success) {
                sharedEntries = result.entries;
            } else {
                error = result.error || 'Failed to load shared entries';
            }
        } catch (err) {
            console.error('Error loading shared entries:', err);
            error = 'Failed to load shared entries. Please try again.';
        } finally {
            isLoading = false;
        }
    }

    function handleClose() {
        onclose?.();
    }

    async function handleSelectEntry(event: { id: string }) {
        selectedEntryId = event.id;
        // TODO: Open entry in read-only mode or preview
        console.log('Selected shared entry:', event.id);
    }

    async function handleRefresh() {
        await loadSharedEntries();
    }

    function handleRetryAuth() {
        // Close this modal and user should go to settings to authenticate
        handleClose();
    }

    // Watch for auth/encryption state changes
    $effect(() => {
        if (canViewShared && sharedEntries.length === 0 && !isLoading) {
            loadSharedEntries();
        }
    });
</script>

<div class="modal-overlay">
    <div class="modal-content shared-entries-modal">
        <div class="modal-header">
            <h2 class="modal-title">🌐 Shared Entries</h2>
            <button 
                class="close-btn"
                onclick={handleClose}
                aria-label="Close shared entries"
            >
                ×
            </button>
        </div>

        <div class="modal-body">
            {#if !canViewShared}
                <div class="auth-required">
                    <div class="auth-icon">🔒</div>
                    <h3>Authentication Required</h3>
                    <p>To view shared entries, you need to:</p>
                    <ul>
                        <li>Sign in to your account</li>
                        <li>Unlock end-to-end encryption</li>
                    </ul>
                    <div class="auth-actions">
                        <button class="btn btn-primary" onclick={handleRetryAuth}>
                            Go to Settings
                        </button>
                        <button class="btn btn-secondary" onclick={handleClose}>
                            Close
                        </button>
                    </div>
                </div>
            {:else if isLoading}
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading shared entries...</p>
                </div>
            {:else if error}
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Unable to Load Shared Entries</h3>
                    <p>{error}</p>
                    <div class="error-actions">
                        <button class="btn btn-primary" onclick={handleRefresh}>
                            Try Again
                        </button>
                        <button class="btn btn-secondary" onclick={handleClose}>
                            Close
                        </button>
                    </div>
                </div>
            {:else}
                <div class="shared-entries-content">
                    <div class="search-section">
                        <input
                            type="text"
                            placeholder="Search shared entries..."
                            bind:value={searchQuery}
                            class="search-input"
                        />
                        <button 
                            class="btn btn-secondary btn-small"
                            onclick={handleRefresh}
                            title="Refresh shared entries"
                        >
                            🔄 Refresh
                        </button>
                    </div>

                    {#if filteredEntries.length === 0}
                        <div class="no-entries">
                            {#if searchQuery}
                                <p>No shared entries match your search for "{searchQuery}"</p>
                            {:else if sharedEntries.length === 0}
                                <div class="empty-icon">📝</div>
                                <h3>No Shared Entries</h3>
                                <p>No entries have been shared with you yet.</p>
                                <p class="text-secondary">
                                    When other users share entries with tags you have access to, they will appear here.
                                </p>
                            {:else}
                                <p>No entries match your search</p>
                            {/if}
                        </div>
                    {:else}
                        <div class="entries-list">
                            {#each filteredEntries as entry (entry.id)}
                                <div class="shared-entry-wrapper">
                                    <EntryCard 
                                        {entry} 
                                        onselect={handleSelectEntry}
                                        readonly={true}
                                    />
                                    <div class="entry-meta">
                                        <span class="shared-by">
                                            Shared by: {entry.author || 'Unknown'}
                                        </span>
                                        {#if entry.tags && entry.tags.length > 0}
                                            <div class="entry-tags">
                                                {#each entry.tags as tag}
                                                    <span class="tag">#{tag}</span>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
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

    .shared-entries-modal {
        max-width: 800px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
    }

    .modal-content {
        background: var(--color-surface);
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        overflow: hidden;
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
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text);
    }

    .modal-body {
        padding: 1.5rem;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .auth-required,
    .loading-state,
    .error-state {
        text-align: center;
        padding: 2rem;
    }

    .auth-icon,
    .error-icon,
    .empty-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }

    .auth-required h3,
    .error-state h3,
    .no-entries h3 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        color: var(--color-text);
    }

    .auth-required p,
    .error-state p,
    .no-entries p {
        margin: 0 0 1rem 0;
        color: var(--color-textSecondary);
    }

    .auth-required ul {
        text-align: left;
        display: inline-block;
        margin: 0 0 1.5rem 0;
        color: var(--color-textSecondary);
    }

    .auth-actions,
    .error-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        margin-top: 1.5rem;
    }

    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .shared-entries-content {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 400px;
    }

    .search-section {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
        align-items: center;
    }

    .search-input {
        flex: 1;
        padding: 0.75rem 1rem;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: var(--color-background);
        color: var(--color-text);
        font-size: 1rem;
    }

    .search-input:focus {
        outline: none;
        border-color: var(--color-primary);
    }

    .no-entries {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--color-textSecondary);
    }

    .entries-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        flex: 1;
    }

    .shared-entry-wrapper {
        border: 1px solid var(--color-border);
        border-radius: 8px;
        overflow: hidden;
        background: var(--color-background);
    }

    .entry-meta {
        padding: 0.75rem 1rem;
        background: var(--color-surface);
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.875rem;
    }

    .shared-by {
        color: var(--color-textSecondary);
        font-style: italic;
    }

    .entry-tags {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .tag {
        background: var(--color-primary);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
    }

    .spinner {
        width: 2rem;
        height: 2rem;
        border: 3px solid var(--color-border);
        border-top: 3px solid var(--color-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
        .modal-overlay {
            padding: 0;
        }

        .shared-entries-modal {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
        }

        .modal-header {
            padding: 1rem;
            padding-top: calc(1rem + env(safe-area-inset-top));
        }

        .search-section {
            flex-direction: column;
            align-items: stretch;
        }

        .auth-actions,
        .error-actions {
            flex-direction: column;
        }
    }
</style>