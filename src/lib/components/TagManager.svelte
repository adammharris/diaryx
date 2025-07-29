<script lang="ts">
    import { tagService, type Tag, type TagWithUsers, type CreateTagData } from '../services/tag.service.js';
    import { userSearchService, type SearchableUser } from '../services/user-search.service.js';
    import UserSearch from './UserSearch.svelte';
    import { onMount } from 'svelte';

    interface Props {
        onclose?: () => void;
    }

    let { onclose }: Props = $props();

    // State
    let tags = $state<TagWithUsers[]>([]);
    let isLoading = $state(true);
    let error = $state<string | null>(null);

    // New tag form
    let showCreateForm = $state(false);
    let newTagName = $state('');
    let newTagColor = $state('#3b82f6');
    let isCreating = $state(false);

    // Tag assignment
    let assigningToTag = $state<string | null>(null);
    let selectedUsers = $state<Map<string, SearchableUser[]>>(new Map());

    // Available colors
    const tagColors = tagService.getTagColors();

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
            
            // Initialize selected users map
            const userMap = new Map<string, SearchableUser[]>();
            for (const tagWithUsers of loadedTags) {
                userMap.set(tagWithUsers.tag.id, tagWithUsers.assignedUsers);
            }
            selectedUsers = userMap;
        } catch (err) {
            console.error('Failed to load tags:', err);
            error = err instanceof Error ? err.message : 'Failed to load tags';
        } finally {
            isLoading = false;
        }
    }

    async function createTag() {
        if (!newTagName.trim()) {
            alert('Please enter a tag name');
            return;
        }

        try {
            isCreating = true;
            const tagData: CreateTagData = {
                name: newTagName.trim(),
                color: newTagColor
            };

            await tagService.createTag(tagData);
            
            // Reset form
            newTagName = '';
            newTagColor = '#3b82f6';
            showCreateForm = false;
            
            // Reload tags
            await loadTags();
        } catch (err) {
            console.error('Failed to create tag:', err);
            alert(err instanceof Error ? err.message : 'Failed to create tag');
        } finally {
            isCreating = false;
        }
    }

    async function deleteTag(tagId: string) {
        const tag = tags.find(t => t.tag.id === tagId);
        if (!tag) return;

        const confirmDelete = confirm(
            `Are you sure you want to delete the tag "${tag.tag.name}"? This will remove access for ${tag.userCount} users and cannot be undone.`
        );

        if (!confirmDelete) return;

        try {
            await tagService.deleteTag(tagId);
            await loadTags();
        } catch (err) {
            console.error('Failed to delete tag:', err);
            alert(err instanceof Error ? err.message : 'Failed to delete tag');
        }
    }

    async function handleUserSelect(tagId: string, user: SearchableUser) {
        try {
            await tagService.assignTagToUser(tagId, user.id);
            
            // Update local state
            const currentUsers = selectedUsers.get(tagId) || [];
            const updatedUsers = [...currentUsers, user];
            selectedUsers.set(tagId, updatedUsers);
            
            // Reload to get fresh data
            await loadTags();
        } catch (err) {
            console.error('Failed to assign tag to user:', err);
            alert(err instanceof Error ? err.message : 'Failed to assign tag to user');
        }
    }

    async function removeUserFromTag(tagId: string, userId: string) {
        try {
            await tagService.removeTagFromUser(tagId, userId);
            
            // Update local state
            const currentUsers = selectedUsers.get(tagId) || [];
            const updatedUsers = currentUsers.filter(u => u.id !== userId);
            selectedUsers.set(tagId, updatedUsers);
            
            // Reload to get fresh data
            await loadTags();
        } catch (err) {
            console.error('Failed to remove user from tag:', err);
            alert(err instanceof Error ? err.message : 'Failed to remove user from tag');
        }
    }

    function handleClose() {
        onclose?.();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && !showCreateForm) {
            handleClose();
        }
    }

    // Get user initials for avatar fallback
    function getUserInitials(user: SearchableUser): string {
        if (user.display_name) {
            return user.display_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        }
        if (user.username) {
            return user.username.slice(0, 2).toUpperCase();
        }
        return user.email.slice(0, 2).toUpperCase();
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-overlay" onclick={handleClose} role="presentation">
    <div 
        class="modal-content tag-manager-modal"
        onclick={(e: Event) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-manager-title"
        tabindex="-1"
    >
        <div class="modal-header">
            <h2 id="tag-manager-title">Tag Management</h2>
            <button class="close-btn" onclick={handleClose} aria-label="Close tag manager">
                ✕
            </button>
        </div>

        <div class="modal-body">
            {#if error}
                <div class="error-message">
                    <p>{error}</p>
                    <button class="btn btn-secondary btn-small" onclick={loadTags}>Retry</button>
                </div>
            {:else if isLoading}
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading tags...</p>
                </div>
            {:else}
                <div class="tag-manager-content">
                    <!-- Create Tag Section -->
                    <div class="create-tag-section">
                        {#if !showCreateForm}
                            <button class="btn btn-primary" onclick={() => showCreateForm = true}>
                                + Create New Tag
                            </button>
                        {:else}
                            <div class="create-tag-form">
                                <h3>Create New Tag</h3>
                                <div class="form-row">
                                    <input
                                        bind:value={newTagName}
                                        type="text"
                                        placeholder="Tag name (e.g., 'Family', 'Work Team')"
                                        class="tag-name-input"
                                        maxlength="50"
                                        disabled={isCreating}
                                    />
                                    <select bind:value={newTagColor} class="color-select" disabled={isCreating}>
                                        {#each tagColors as color}
                                            <option value={color.value}>{color.name}</option>
                                        {/each}
                                    </select>
                                </div>
                                <div class="form-actions">
                                    <button 
                                        class="btn btn-primary btn-small" 
                                        onclick={createTag}
                                        disabled={isCreating || !newTagName.trim()}
                                    >
                                        {isCreating ? 'Creating...' : 'Create Tag'}
                                    </button>
                                    <button 
                                        class="btn btn-secondary btn-small" 
                                        onclick={() => { showCreateForm = false; newTagName = ''; }}
                                        disabled={isCreating}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Tags List -->
                    <div class="tags-list">
                        {#if tags.length === 0}
                            <div class="empty-state">
                                <p>No tags created yet.</p>
                                <p class="text-secondary">Create your first tag to start sharing entries with specific users.</p>
                            </div>
                        {:else}
                            {#each tags as tagWithUsers (tagWithUsers.tag.id)}
                                <div class="tag-item">
                                    <div class="tag-header">
                                        <div class="tag-info">
                                            <div 
                                                class="tag-color-dot" 
                                                style="background-color: {tagWithUsers.tag.color}"
                                            ></div>
                                            <h4 class="tag-name">{tagWithUsers.tag.name}</h4>
                                            <span class="user-count">
                                                {tagWithUsers.userCount} {tagWithUsers.userCount === 1 ? 'user' : 'users'}
                                            </span>
                                        </div>
                                        <button 
                                            class="delete-tag-btn"
                                            onclick={() => deleteTag(tagWithUsers.tag.id)}
                                            title="Delete tag"
                                        >
                                            🗑️
                                        </button>
                                    </div>

                                    <div class="tag-content">
                                        <!-- Assigned Users -->
                                        {#if tagWithUsers.assignedUsers.length > 0}
                                            <div class="assigned-users">
                                                <h5>Assigned Users:</h5>
                                                <div class="user-list">
                                                    {#each tagWithUsers.assignedUsers as user (user.id)}
                                                        <div class="user-item">
                                                            <div class="user-avatar">
                                                                {#if user.avatar_url}
                                                                    <img src={user.avatar_url} alt={user.display_name || user.username} />
                                                                {:else}
                                                                    <div class="avatar-fallback">
                                                                        {getUserInitials(user)}
                                                                    </div>
                                                                {/if}
                                                            </div>
                                                            <div class="user-info">
                                                                <div class="user-name">
                                                                    {user.display_name || user.username}
                                                                </div>
                                                                <div class="user-email">{user.email}</div>
                                                            </div>
                                                            <button 
                                                                class="remove-user-btn"
                                                                onclick={() => removeUserFromTag(tagWithUsers.tag.id, user.id)}
                                                                title="Remove user from tag"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    {/each}
                                                </div>
                                            </div>
                                        {/if}

                                        <!-- Add Users -->
                                        <div class="add-users-section">
                                            <h5>Add Users to Tag:</h5>
                                            <UserSearch
                                                placeholder="Search users to add to this tag..."
                                                onUserSelect={(user) => handleUserSelect(tagWithUsers.tag.id, user)}
                                                selectedUsers={tagWithUsers.assignedUsers}
                                            />
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .tag-manager-modal {
        width: 95vw;
        max-width: 900px;
        max-height: 95vh;
        overflow: visible; /* Allow dropdown to extend outside */
        display: flex;
        flex-direction: column;
    }

    .tag-manager-modal .modal-body {
        padding: 0; /* Remove default padding, let content handle it */
        overflow: visible; /* Allow dropdown to extend outside */
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .tag-manager-content {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        overflow-y: auto;
        flex: 1;
        padding: 1.5rem;
        padding-bottom: 300px; /* Extra space for dropdown */
    }

    .create-tag-section {
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-border);
    }

    .create-tag-form {
        background: var(--color-surface);
        padding: 1rem;
        border-radius: 0.5rem;
        border: 1px solid var(--color-border);
    }

    .create-tag-form h3 {
        margin: 0 0 1rem 0;
        color: var(--color-text);
    }

    .form-row {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1rem;
        align-items: center;
    }

    .tag-name-input {
        flex: 2;
        padding: 0.75rem 1rem;
        border: 1px solid var(--color-border);
        border-radius: 0.375rem;
        background: var(--color-background);
        color: var(--color-text);
        font-size: 1rem;
        min-width: 200px;
    }

    .tag-name-input:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px var(--color-primaryShadow);
    }

    .color-select {
        flex: 0 0 auto;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: 0.375rem;
        background: var(--color-background);
        color: var(--color-text);
        width: 100px;
        font-size: 0.9rem;
    }

    .color-select:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px var(--color-primaryShadow);
    }

    .form-actions {
        display: flex;
        gap: 0.5rem;
    }

    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2rem;
        gap: 1rem;
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

    .error-message {
        padding: 1rem;
        background: var(--color-background);
        border: 1px solid var(--color-accent);
        border-radius: 0.5rem;
        color: var(--color-accent);
        text-align: center;
    }

    .empty-state {
        text-align: center;
        padding: 2rem;
        color: var(--color-textSecondary);
    }

    .tags-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .tag-item {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        overflow: hidden;
    }

    .tag-header {
        padding: 1rem;
        background: var(--color-background);
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .tag-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .tag-color-dot {
        width: 1rem;
        height: 1rem;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .tag-name {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text);
    }

    .user-count {
        font-size: 0.875rem;
        color: var(--color-textSecondary);
        padding: 0.25rem 0.5rem;
        background: var(--color-background);
        border-radius: 1rem;
    }

    .delete-tag-btn {
        background: none;
        border: none;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 0.25rem;
        transition: background-color 0.2s ease;
    }

    .delete-tag-btn:hover {
        background: var(--color-background);
    }

    .tag-content {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .assigned-users h5,
    .add-users-section h5 {
        margin: 0 0 0.75rem 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .add-users-section {
        position: relative;
        margin-bottom: 2rem; /* Extra space for dropdown */
    }

    .user-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }

    .user-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        background: var(--color-background);
        border-radius: 0.375rem;
        border: 1px solid var(--color-border);
    }

    .user-avatar {
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
    }

    .user-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .avatar-fallback {
        width: 100%;
        height: 100%;
        background: var(--color-accent);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 0.75rem;
    }

    .user-info {
        flex: 1;
        min-width: 0;
    }

    .user-name {
        font-weight: 500;
        color: var(--color-text);
        margin-bottom: 0.125rem;
    }

    .user-email {
        font-size: 0.8125rem;
        color: var(--color-textSecondary);
    }

    .remove-user-btn {
        background: none;
        border: none;
        color: var(--color-textSecondary);
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 0.25rem;
        transition: all 0.2s ease;
        flex-shrink: 0;
    }

    .remove-user-btn:hover {
        background: var(--color-background);
        color: var(--color-accent);
    }

    /* Mobile responsive adjustments */
    @media (max-width: 768px) {
        .form-row {
            flex-direction: column;
            gap: 1rem;
        }

        .tag-name-input {
            flex: 1;
            min-width: unset;
            width: 100%;
        }

        .color-select {
            flex: 1;
            width: 100%;
        }

        .tag-manager-modal {
            width: 100vw;
            max-width: 100vw;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
        }

        .tag-manager-content {
            padding: 1rem;
            padding-bottom: 200px;
        }
    }
</style>