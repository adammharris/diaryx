<script lang="ts">
  import { storage, type JournalEntryMetadata } from '../lib/storage/index.ts';
  import EntryCard from '../lib/components/EntryCard.svelte';
  import Editor from '../lib/components/Editor.svelte';
  import Settings from '../lib/components/Settings.svelte';
  import { currentTheme } from '../lib/stores/theme.js';

  let entries: JournalEntryMetadata[] = $state([]);
  let selectedEntryId: string | null = $state(null);
  let isLoading = $state(true);
  let searchQuery = $state('');
  let isCreating = $state(false);
  let newEntryTitle = $state('');
  let showSettings = $state(false);
  let isTauri = $state(false);

  // Initialize theme and detect environment
  $effect(() => {
    // This will trigger the theme initialization
    currentTheme.set($currentTheme);
    // Detect if we're in Tauri
    isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
  });

  // Filtered entries based on search
  let filteredEntries = $derived(
    entries.filter(entry => 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.preview.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // Load entries on mount
  $effect(() => {
    loadEntries();
  });

  async function loadEntries() {
    isLoading = true;
    try {
      entries = await storage.getAllEntries();
    } catch (error) {
      console.error('Failed to load entries:', error);
      // Show error message to user
      alert('Failed to load entries. Some files may have been deleted.');
    } finally {
      isLoading = false;
    }
  }

  async function refreshEntries() {
    if (isTauri) {
      try {
        // Clear cache and reload from filesystem
        await storage.clearCacheAndRefresh();
        await loadEntries();
      } catch (error) {
        console.error('Failed to refresh:', error);
        alert('Failed to refresh entries');
      }
    } else {
      // In web mode, just reload
      await loadEntries();
    }
  }

  function handleSelectEntry(event: { id: string }) {
    selectedEntryId = event.id;
  }

  async function handleDeleteEntry(event: { id: string }) {
    console.log('handleDeleteEntry called with id:', event.id);
    try {
      const success = await storage.deleteEntry(event.id);
      console.log('Delete result:', success);
      if (success) {
        entries = entries.filter(e => e.id !== event.id);
        if (selectedEntryId === event.id) {
          selectedEntryId = null;
        }
        console.log('Entry deleted successfully');
      } else {
        console.log('Delete failed');
        alert('Failed to delete entry');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete entry');
    }
  }

  function handleCloseEditor() {
    selectedEntryId = null;
  }

  function handleEntrySaved() {
    // Refresh the entries list
    loadEntries();
  }

  async function handleEntryDecrypted() {
    // Small delay to ensure metadata update is complete
    setTimeout(() => {
      loadEntries();
    }, 100);
  }

  async function handleCreateEntry() {
    if (!newEntryTitle.trim()) return;
    
    isCreating = true;
    try {
      const id = await storage.createEntry(newEntryTitle);
      if (id) {
        newEntryTitle = '';
        await loadEntries();
        selectedEntryId = id;
      } else {
        alert('Failed to create entry');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create entry');
    } finally {
      isCreating = false;
    }
  }

  function handleKeydownCreate(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleCreateEntry();
    }
  }

  function handleOpenSettings() {
    showSettings = true;
  }

  function handleCloseSettings() {
    showSettings = false;
  }
</script>

<main class="app-container">
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="header-content">
        <h1 class="app-title">Diaryx</h1>
        <p class="app-subtitle">Personal Journal</p>
      </div>
      <div class="header-buttons">
        <button 
          class="refresh-btn"
          onclick={refreshEntries}
          aria-label="Refresh entries"
          title="Refresh entries from filesystem"
        >
          🔄
        </button>
        <button 
          class="settings-btn"
          onclick={handleOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </div>

    <div class="new-entry">
      <input
        type="text"
        placeholder="New journal entry title..."
        bind:value={newEntryTitle}
        onkeydown={handleKeydownCreate}
        class="new-entry-input"
      />
      <button
        onclick={handleCreateEntry}
        disabled={isCreating || !newEntryTitle.trim()}
        class="new-entry-btn"
      >
        {isCreating ? '...' : '+'}
      </button>
    </div>

    <div class="search-container">
      <input
        type="text"
        placeholder="Search entries..."
        bind:value={searchQuery}
        class="search-input"
      />
    </div>

    <div class="entries-container">
      {#if isLoading}
        <div class="loading">Loading entries...</div>
      {:else if filteredEntries.length === 0}
        <div class="no-entries">
          {searchQuery ? 'No entries match your search' : 'No journal entries found. Create your first entry above!'}
        </div>
      {:else}
        {#each filteredEntries as entry (entry.id)}
          <EntryCard 
            {entry} 
            onselect={handleSelectEntry}
            ondelete={handleDeleteEntry}
          />
        {/each}
      {/if}
    </div>
  </aside>

  <main class="main-content">
    <Editor 
      entryId={selectedEntryId}
      on:close={handleCloseEditor}
      on:saved={handleEntrySaved}
      on:decrypted={handleEntryDecrypted}
    />
  </main>
</main>

{#if showSettings}
  <Settings on:close={handleCloseSettings} />
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--color-background, #f8fafc);
  }

  .app-container {
    display: flex;
    height: 100vh;
    max-height: 100vh;
    overflow: hidden;
  }

  .sidebar {
    width: 350px;
    background: var(--color-surface, white);
    border-right: 1px solid var(--color-border, #e5e7eb);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-content {
    flex: 1;
  }

  .app-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.25rem 0;
  }

  .app-subtitle {
    margin: 0;
    opacity: 0.9;
    font-size: 0.875rem;
  }

  .header-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .refresh-btn,
  .settings-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    padding: 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.5rem;
    height: 2.5rem;
  }

  .refresh-btn:hover,
  .settings-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .new-entry {
    display: flex;
    padding: 1rem;
    gap: 0.5rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }

  .new-entry-input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 6px;
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s ease;
  }

  .new-entry-input:focus {
    border-color: var(--color-primary, #3b82f6);
  }

  .new-entry-btn {
    padding: 0.75rem 1rem;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    transition: background-color 0.2s ease;
    min-width: 3rem;
  }

  .new-entry-btn:hover:not(:disabled) {
    background: var(--color-primaryHover, #2563eb);
  }

  .new-entry-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .search-container {
    padding: 1rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }

  .search-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 6px;
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s ease;
    box-sizing: border-box;
  }

  .search-input:focus {
    border-color: var(--color-primary, #3b82f6);
  }

  .entries-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .main-content {
    flex: 1;
    padding: 1rem;
    overflow: hidden;
  }

  .loading,
  .no-entries {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--color-textSecondary, #6b7280);
    text-align: center;
    font-size: 0.875rem;
  }

  .no-entries {
    line-height: 1.5;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .app-container {
      flex-direction: column;
    }

    .sidebar {
      width: 100%;
      height: 50vh;
    }

    .main-content {
      height: 50vh;
    }
  }
</style>
