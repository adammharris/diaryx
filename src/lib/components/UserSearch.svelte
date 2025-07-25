<script lang="ts">
    import { userSearchService, type SearchableUser } from '../services/user-search.service.js';
    import { onMount } from 'svelte';

    interface Props {
        placeholder?: string;
        onUserSelect: (user: SearchableUser) => void;
        selectedUsers?: SearchableUser[];
        excludeUsers?: string[]; // User IDs to exclude from results
        disabled?: boolean;
    }

    let { 
        placeholder = "Search for users...", 
        onUserSelect, 
        selectedUsers = [],
        excludeUsers = [],
        disabled = false 
    }: Props = $props();

    let searchQuery = $state('');
    let searchResults = $state<SearchableUser[]>([]);
    let isSearching = $state(false);
    let showResults = $state(false);
    let searchInput: HTMLInputElement;
    let searchTimeout: NodeJS.Timeout;
    let searchContainer: HTMLDivElement;

    // Create debounced search function
    const debouncedSearch = userSearchService.createDebouncedSearch(300);

    // Reactive search when query changes
    $effect(() => {
        if (searchQuery.trim().length >= 2) {
            performSearch(searchQuery);
        } else {
            searchResults = [];
            showResults = false;
            isSearching = false;
        }
    });

    let dropdownStyle = $state('');

    async function performSearch(query: string) {
        if (disabled) return;
        
        isSearching = true;
        showResults = true;
        
        // Position dropdown using fixed positioning for better modal compatibility
        if (searchContainer) {
            const rect = searchContainer.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            
            // Use fixed positioning to escape modal overflow constraints
            if (spaceBelow >= 200) {
                // Position below
                dropdownStyle = `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px; z-index: 1200;`;
            } else if (spaceAbove >= 200) {
                // Position above
                dropdownStyle = `position: fixed; bottom: ${window.innerHeight - rect.top + 4}px; left: ${rect.left}px; width: ${rect.width}px; z-index: 1200;`;
            } else {
                // Not enough space either way, position below with scrolling
                dropdownStyle = `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px; z-index: 1200; max-height: ${spaceBelow - 20}px;`;
            }
        }

        try {
            const result = await debouncedSearch(query, 10);
            
            // Filter out already selected users and excluded users
            const selectedUserIds = new Set(selectedUsers.map(u => u.id));
            const excludedUserIds = new Set(excludeUsers);
            
            searchResults = result.users.filter(user => 
                !selectedUserIds.has(user.id) && 
                !excludedUserIds.has(user.id)
            );
        } catch (error) {
            console.error('Search failed:', error);
            searchResults = [];
        } finally {
            isSearching = false;
        }
    }

    function handleUserSelect(user: SearchableUser) {
        // Validate user can be tagged
        const validation = userSearchService.validateUserForTagging(user);
        if (!validation.valid) {
            alert(`Cannot select this user: ${validation.reason}`);
            return;
        }

        onUserSelect(user);
        
        // Clear search
        searchQuery = '';
        searchResults = [];
        showResults = false;
        searchInput?.blur();
    }

    function handleInputBlur() {
        // Delay hiding results to allow clicking on results
        setTimeout(() => {
            showResults = false;
        }, 200);
    }

    function handleInputFocus() {
        if (searchResults.length > 0) {
            showResults = true;
            // Recalculate position when focused
            updateDropdownPosition();
        }
    }

    function updateDropdownPosition() {
        if (searchContainer && showResults) {
            const rect = searchContainer.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            
            if (spaceBelow >= 200) {
                dropdownStyle = `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px; z-index: 1200;`;
            } else if (spaceAbove >= 200) {
                dropdownStyle = `position: fixed; bottom: ${window.innerHeight - rect.top + 4}px; left: ${rect.left}px; width: ${rect.width}px; z-index: 1200;`;
            } else {
                dropdownStyle = `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px; z-index: 1200; max-height: ${spaceBelow - 20}px;`;
            }
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            searchQuery = '';
            searchResults = [];
            showResults = false;
            searchInput?.blur();
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

    // Highlight search terms in user names
    function highlightMatch(text: string | null | undefined, query: string): string {
        if (!query || !text) return text || '';
        
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
</script>

<div class="user-search-container" bind:this={searchContainer}>
    <div class="search-input-wrapper">
        <input
            bind:this={searchInput}
            bind:value={searchQuery}
            type="text"
            {placeholder}
            {disabled}
            class="search-input"
            onblur={handleInputBlur}
            onfocus={handleInputFocus}
            onkeydown={handleKeydown}
            autocomplete="off"
        />
        
        {#if isSearching}
            <div class="search-spinner">
                <div class="spinner"></div>
            </div>
        {/if}
    </div>

    {#if showResults}
        <div class="search-results" style={dropdownStyle}>
            {#if searchResults.length === 0 && !isSearching}
                <div class="no-results">
                    {#if searchQuery.trim().length < 2}
                        <span class="text-secondary">Type at least 2 characters to search</span>
                    {:else}
                        <span class="text-secondary">No users found matching "{searchQuery}"</span>
                    {/if}
                </div>
            {:else}
                {#each searchResults as user (user.id)}
                    <button
                        class="user-result"
                        onclick={() => handleUserSelect(user)}
                        type="button"
                    >
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
                                {@html highlightMatch(user.display_name || user.username || user.email, searchQuery)}
                            </div>
                            {#if user.username && user.display_name}
                                <div class="user-username">
                                    @{@html highlightMatch(user.username, searchQuery)}
                                </div>
                            {/if}
                            <div class="user-email">
                                {@html highlightMatch(user.email, searchQuery)}
                            </div>
                        </div>

                        <div class="user-status">
                            {#if user.public_key}
                                <span class="status-badge encrypted" title="Encryption enabled">🔒</span>
                            {:else}
                                <span class="status-badge no-encryption" title="No encryption keys">⚠️</span>
                            {/if}
                        </div>
                    </button>
                {/each}
            {/if}
        </div>
    {/if}
</div>

<style>
    .user-search-container {
        position: relative;
        width: 100%;
    }

    .search-input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }

    .search-input {
        width: 100%;
        padding: 0.75rem 1rem;
        border: 2px solid var(--border-color);
        border-radius: 0.5rem;
        background: var(--background-color);
        color: var(--text-color);
        font-size: 1rem;
        transition: border-color 0.2s ease;
    }

    .search-input:focus {
        outline: none;
        border-color: var(--primary-color);
    }

    .search-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .search-spinner {
        position: absolute;
        right: 1rem;
        display: flex;
        align-items: center;
    }

    .spinner {
        width: 1rem;
        height: 1rem;
        border: 2px solid var(--border-color);
        border-top: 2px solid var(--primary-color);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .search-results {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 1100; /* Higher than modal z-index (1000) */
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        max-height: 200px; /* Reduced height to fit in modal */
        overflow-y: auto;
        margin-top: 0.25rem;
    }


    .no-results {
        padding: 1rem;
        text-align: center;
    }

    .user-result {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border: none;
        background: transparent;
        color: var(--text-color);
        cursor: pointer;
        transition: background-color 0.2s ease;
        text-align: left;
    }

    .user-result:hover {
        background: var(--hover-color);
    }

    .user-result:focus {
        outline: none;
        background: var(--hover-color);
    }

    .user-avatar {
        width: 2.5rem;
        height: 2.5rem;
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
        background: var(--accent-color);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 0.875rem;
    }

    .user-info {
        flex: 1;
        min-width: 0;
    }

    .user-name {
        font-weight: 600;
        color: var(--text-color);
        margin-bottom: 0.125rem;
    }

    .user-username {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-bottom: 0.125rem;
    }

    .user-email {
        font-size: 0.8125rem;
        color: var(--text-secondary);
    }

    .user-status {
        flex-shrink: 0;
    }

    .status-badge {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        font-weight: 500;
    }

    .status-badge.encrypted {
        background: var(--success-color-bg);
        color: var(--success-color);
    }

    .status-badge.no-encryption {
        background: var(--warning-color-bg);
        color: var(--warning-color);
    }

    :global(mark) {
        background: var(--primary-color-bg);
        color: var(--primary-color);
        padding: 0.125rem 0.25rem;
        border-radius: 0.25rem;
    }
</style>