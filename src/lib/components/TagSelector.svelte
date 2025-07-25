<script lang="ts">
    import { tagService, type TagWithUsers } from '../services/tag.service.js';
    import { onMount } from 'svelte';

    interface Props {
        selectedTagIds?: string[];
        onTagSelectionChange: (tagIds: string[]) => void;
        disabled?: boolean;
        showCreateButton?: boolean;
    }

    let { 
        selectedTagIds = [], 
        onTagSelectionChange, 
        disabled = false,
        showCreateButton = true 
    }: Props = $props();

    // State
    let tags = $state<TagWithUsers[]>([]);
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let isExpanded = $state(false);

    // Reactive derived values
    let selectedTags = $derived(tags.filter(t => selectedTagIds.includes(t.tag.id)));
    let totalUsersWhoWillHaveAccess = $derived(() => {
        const userIds = new Set<string>();
        for (const tagWithUsers of selectedTags) {
            for (const user of tagWithUsers.assignedUsers) {
                userIds.add(user.id);
            }
        }
        return userIds.size;
    });

    // Load tags on mount
    onMount(async () => {
        await loadTags();
    });

    async function loadTags() {
        try {
            isLoading = true;
            error = null;
            const loadedTags = await tagService.loadTags();
            tags = loadedTags;
        } catch (err) {
            console.error('Failed to load tags:', err);
            error = err instanceof Error ? err.message : 'Failed to load tags';
        } finally {
            isLoading = false;
        }
    }

    function toggleTag(tagId: string) {
        if (disabled) return;
        
        let newSelectedIds: string[];
        if (selectedTagIds.includes(tagId)) {
            newSelectedIds = selectedTagIds.filter(id => id !== tagId);
        } else {
            newSelectedIds = [...selectedTagIds, tagId];
        }
        
        onTagSelectionChange(newSelectedIds);
    }

    function clearSelection() {
        if (disabled) return;
        onTagSelectionChange([]);
    }

    function selectAll() {
        if (disabled) return;
        const allTagIds = tags.map(t => t.tag.id);
        onTagSelectionChange(allTagIds);
    }

    function handleExpandToggle() {
        isExpanded = !isExpanded;
    }

    // Get user initials for avatar fallback
    function getUserInitials(displayName: string, username?: string, email?: string): string {
        if (displayName) {
            return displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        }
        if (username) {
            return username.slice(0, 2).toUpperCase();
        }
        if (email) {
            return email.slice(0, 2).toUpperCase();
        }
        return 'U';
    }
</script>

<div class="tag-selector">
    <div class="selector-header">
        <div class="header-info">
            <h4 class="selector-title">Share with Tags</h4>
            <p class="selector-description">
                Select tags to share this entry with specific users through end-to-end encryption
            </p>
        </div>
        
        {#if !isExpanded && tags.length > 0}
            <button 
                class="expand-button"
                onclick={handleExpandToggle}
                {disabled}
                aria-label="Expand tag selection"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6,9 12,15 18,9"></polyline>
                </svg>
            </button>
        {/if}
    </div>

    <!-- Selected Tags Summary -->
    {#if selectedTags.length > 0 && !isExpanded}
        <div class="selected-summary">
            <div class="selected-tags-preview">
                {#each selectedTags.slice(0, 3) as tagWithUsers}
                    <div class="tag-chip selected">
                        <div 
                            class="tag-color-dot" 
                            style="background-color: {tagWithUsers.tag.color}"
                        ></div>
                        <span>{tagWithUsers.tag.name}</span>
                        <span class="user-count">({tagWithUsers.userCount})</span>
                    </div>
                {/each}
                {#if selectedTags.length > 3}
                    <span class="more-tags">+{selectedTags.length - 3} more</span>
                {/if}
            </div>
            
            <div class="access-summary">
                <span class="access-count">
                    {totalUsersWhoWillHaveAccess()} {totalUsersWhoWillHaveAccess() === 1 ? 'user' : 'users'} will have access
                </span>
            </div>
        </div>
    {/if}

    <!-- Expanded Content -->
    {#if isExpanded || selectedTags.length === 0}
        <div class="selector-content">
            {#if error}
                <div class="error-state">
                    <p class="error-message">{error}</p>
                    <button class="btn btn-secondary btn-small" onclick={loadTags}>Retry</button>
                </div>
            {:else if isLoading}
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading tags...</p>
                </div>
            {:else if tags.length === 0}
                <div class="empty-state">
                    <p>No tags available for sharing.</p>
                    {#if showCreateButton}
                        <p class="text-secondary">
                            Create tags in Settings → Sharing & Tags to share entries with other users.
                        </p>
                    {/if}
                </div>
            {:else}
                <!-- Tag Selection -->
                <div class="tag-selection">
                    <div class="selection-controls">
                        <button 
                            class="control-btn"
                            onclick={selectAll}
                            {disabled}
                            title="Select all tags"
                        >
                            Select All
                        </button>
                        <button 
                            class="control-btn"
                            onclick={clearSelection}
                            {disabled}
                            title="Clear selection"
                        >
                            Clear
                        </button>
                        {#if isExpanded}
                            <button 
                                class="control-btn collapse-btn"
                                onclick={handleExpandToggle}
                                {disabled}
                                title="Collapse"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="18,15 12,9 6,15"></polyline>
                                </svg>
                            </button>
                        {/if}
                    </div>

                    <div class="tags-grid">
                        {#each tags as tagWithUsers (tagWithUsers.tag.id)}
                            {@const isSelected = selectedTagIds.includes(tagWithUsers.tag.id)}
                            <button
                                class="tag-option"
                                class:selected={isSelected}
                                class:disabled={disabled}
                                onclick={() => toggleTag(tagWithUsers.tag.id)}
                                {disabled}
                            >
                                <div class="tag-info">
                                    <div 
                                        class="tag-color-dot" 
                                        style="background-color: {tagWithUsers.tag.color}"
                                    ></div>
                                    <div class="tag-details">
                                        <span class="tag-name">{tagWithUsers.tag.name}</span>
                                        <span class="tag-users">
                                            {tagWithUsers.userCount} {tagWithUsers.userCount === 1 ? 'user' : 'users'}
                                        </span>
                                    </div>
                                </div>

                                <div class="selection-indicator">
                                    {#if isSelected}
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="20,6 9,17 4,12"></polyline>
                                        </svg>
                                    {:else}
                                        <div class="selection-circle"></div>
                                    {/if}
                                </div>
                            </button>

                            <!-- Show users for selected tags -->
                            {#if isSelected && tagWithUsers.assignedUsers.length > 0}
                                <div class="tag-users-preview">
                                    <div class="users-list">
                                        {#each tagWithUsers.assignedUsers.slice(0, 5) as user}
                                            <div class="user-preview" title={user.display_name || user.username}>
                                                {#if user.avatar_url}
                                                    <img src={user.avatar_url} alt={user.display_name || user.username} />
                                                {:else}
                                                    <div class="avatar-fallback">
                                                        {getUserInitials(user.display_name, user.username, user.email)}
                                                    </div>
                                                {/if}
                                            </div>
                                        {/each}
                                        {#if tagWithUsers.assignedUsers.length > 5}
                                            <div class="more-users">
                                                +{tagWithUsers.assignedUsers.length - 5}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                </div>

                <!-- Selection Summary -->
                {#if selectedTags.length > 0}
                    <div class="selection-summary">
                        <div class="summary-info">
                            <span class="selected-count">
                                {selectedTags.length} {selectedTags.length === 1 ? 'tag' : 'tags'} selected
                            </span>
                            <span class="separator">•</span>
                            <span class="access-count">
                                {totalUsersWhoWillHaveAccess()} {totalUsersWhoWillHaveAccess() === 1 ? 'user' : 'users'} will have access
                            </span>
                        </div>
                        
                        <div class="encryption-notice">
                            🔒 Entry will be encrypted separately for each user
                        </div>
                    </div>
                {/if}
            {/if}
        </div>
    {/if}
</div>

<style>
    .tag-selector {
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        background: var(--surface-color);
        padding: 1rem;
    }

    .selector-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
    }

    .header-info {
        flex: 1;
    }

    .selector-title {
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-color);
    }

    .selector-description {
        margin: 0;
        font-size: 0.875rem;
        color: var(--text-secondary);
        line-height: 1.4;
    }

    .expand-button {
        background: none;
        border: 1px solid var(--border-color);
        border-radius: 0.375rem;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0.5rem;
        transition: all 0.2s ease;
        margin-left: 1rem;
    }

    .expand-button:hover:not(:disabled) {
        background: var(--hover-color);
        color: var(--text-color);
    }

    .expand-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .selected-summary {
        margin-bottom: 1rem;
        padding: 0.75rem;
        background: var(--background-color);
        border-radius: 0.375rem;
        border: 1px solid var(--border-color);
    }

    .selected-tags-preview {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    .tag-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.75rem;
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: 1rem;
        font-size: 0.8125rem;
    }

    .tag-chip.selected {
        background: var(--primary-color-bg);
        border-color: var(--primary-color);
        color: var(--primary-color);
    }

    .tag-color-dot {
        width: 0.75rem;
        height: 0.75rem;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.1);
        flex-shrink: 0;
    }

    .user-count {
        font-weight: 500;
    }

    .more-tags {
        color: var(--text-secondary);
        font-size: 0.8125rem;
        padding: 0.375rem 0.75rem;
    }

    .access-summary {
        text-align: center;
        color: var(--text-secondary);
        font-size: 0.8125rem;
    }

    .access-count {
        font-weight: 500;
        color: var(--text-color);
    }

    .loading-state,
    .error-state,
    .empty-state {
        text-align: center;
        padding: 2rem 1rem;
        color: var(--text-secondary);
    }

    .spinner {
        width: 1.5rem;
        height: 1.5rem;
        border: 2px solid var(--border-color);
        border-top: 2px solid var(--primary-color);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .error-message {
        color: var(--error-color);
        margin-bottom: 1rem;
    }

    .selection-controls {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
        justify-content: flex-end;
    }

    .control-btn {
        background: none;
        border: 1px solid var(--border-color);
        border-radius: 0.375rem;
        padding: 0.375rem 0.75rem;
        font-size: 0.8125rem;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .control-btn:hover:not(:disabled) {
        background: var(--hover-color);
        color: var(--text-color);
    }

    .control-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .collapse-btn {
        display: flex;
        align-items: center;
        padding: 0.375rem;
    }

    .tags-grid {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: 1fr;
    }

    .tag-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem;
        background: var(--background-color);
        border: 1px solid var(--border-color);
        border-radius: 0.375rem;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        width: 100%;
    }

    .tag-option:hover:not(:disabled) {
        background: var(--hover-color);
    }

    .tag-option.selected {
        background: var(--primary-color-bg);
        border-color: var(--primary-color);
    }

    .tag-option.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .tag-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 1;
    }

    .tag-details {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
    }

    .tag-name {
        font-weight: 500;
        color: var(--text-color);
    }

    .tag-users {
        font-size: 0.8125rem;
        color: var(--text-secondary);
    }

    .selection-indicator {
        color: var(--primary-color);
        flex-shrink: 0;
    }

    .selection-circle {
        width: 1rem;
        height: 1rem;
        border: 2px solid var(--border-color);
        border-radius: 50%;
    }

    .tag-users-preview {
        grid-column: 1;
        margin-left: 2rem;
        margin-top: -0.5rem;
        margin-bottom: 0.25rem;
    }

    .users-list {
        display: flex;
        gap: 0.375rem;
        align-items: center;
    }

    .user-preview {
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid var(--background-color);
    }

    .user-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .avatar-fallback {
        width: 100%;
        height: 100%;
        background: var(--accent-color);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 0.625rem;
    }

    .more-users {
        font-size: 0.75rem;
        color: var(--text-secondary);
        padding: 0.25rem 0.5rem;
        background: var(--surface-color);
        border-radius: 0.75rem;
        border: 1px solid var(--border-color);
    }

    .selection-summary {
        margin-top: 1rem;
        padding: 0.75rem;
        background: var(--primary-color-bg);
        border-radius: 0.375rem;
        border: 1px solid var(--primary-color);
    }

    .summary-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
    }

    .selected-count,
    .access-count {
        font-weight: 500;
        color: var(--primary-color);
    }

    .separator {
        color: var(--text-secondary);
    }

    .encryption-notice {
        font-size: 0.8125rem;
        color: var(--text-secondary);
        font-style: italic;
    }
</style>