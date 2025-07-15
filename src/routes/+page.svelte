<script lang="ts">
  import { storage, type JournalEntryMetadata } from '../lib/storage/index';
  import EntryCard from '../lib/components/EntryCard.svelte';
  import Editor from '../lib/components/Editor.svelte';
  import Settings from '../lib/components/Settings.svelte';
  import Dialog from '../lib/components/Dialog.svelte';
  import BatchUnlock from '../lib/components/BatchUnlock.svelte';
  import { currentTheme } from '../lib/stores/theme.js';
  import { detectTauri } from '../lib/utils/tauri.js';

  let entries: JournalEntryMetadata[] = $state([]);
  let selectedEntryId: string | null = $state(null);
  let isLoading = $state(true);
  let searchQuery = $state('');
  let isCreating = $state(false);
  let newEntryTitle = $state('');
  let showSettings = $state(false);
  let showBatchUnlock = $state(false);
  let isTauri = $state(false);
  let reloadTimeout: number | null = null;

  // Dialog state
  let dialogState = $state({
    isVisible: false,
    title: '',
    message: '',
    type: 'info' as 'info' | 'error' | 'warning' | 'confirm',
    confirmText: 'OK',
    cancelText: 'Cancel',
    onconfirm: null as (() => void) | null,
    oncancel: null as (() => void) | null
  });

  // Initialize theme and detect environment
  $effect(() => {
    // This will trigger the theme initialization
    currentTheme.set($currentTheme);
    // Detect if we're in Tauri using the proper utility
    isTauri = detectTauri();
  });

  // Filtered entries based on search
  let filteredEntries = $derived(
    entries.filter(entry => 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.preview.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  // Load entries on mount and start file watching
  $effect(() => {
    loadEntries();
    
    // Start file watching in Tauri mode
    if (isTauri) {
      storage.startFileWatching(() => {
        console.log('File change detected, debouncing reload');
        
        // Clear existing timeout
        if (reloadTimeout) {
          clearTimeout(reloadTimeout);
        }
        
        // Debounce the reload to avoid excessive calls
        reloadTimeout = setTimeout(() => {
          console.log('Reloading entries due to file change');
          loadEntries();
          reloadTimeout = null;
        }, 300);
      });
    }
    
    // Cleanup function to stop watching when component is destroyed
    return () => {
      if (isTauri) {
        storage.stopFileWatching();
      }
      
      // Clear any pending timeout
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
        reloadTimeout = null;
      }
    };
  });

  async function loadEntries() {
    isLoading = true;
    try {
      entries = await storage.getAllEntries();
    } catch (error) {
      console.error('Failed to load entries:', error);
      // Show error message to user
      showDialog({
        title: 'Error Loading Entries',
        message: 'Failed to load entries. Some files may have been deleted.',
        type: 'error'
      });
    } finally {
      isLoading = false;
    }
  }


  function handleSelectEntry(event: { id: string }) {
    selectedEntryId = event.id;
  }

  async function handleDeleteEntry(event: { id: string }) {
    console.log('handleDeleteEntry called with id:', event.id);
    
    // Find the entry to get its title for the confirmation dialog
    const entry = entries.find(e => e.id === event.id);
    const entryTitle = entry?.title || 'this entry';
    
    // Show confirmation dialog
    showDialog({
      title: 'Delete Entry',
      message: `Are you sure you want to delete "${entryTitle}"? This action cannot be undone.`,
      type: 'confirm',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onconfirm: async () => {
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
            showDialog({
              title: 'Delete Failed',
              message: 'Failed to delete entry. Please try again.',
              type: 'error'
            });
          }
        } catch (error) {
          console.error('Delete error:', error);
          showDialog({
            title: 'Delete Failed',
            message: 'Failed to delete entry. Please try again.',
            type: 'error'
          });
        }
      }
    });
  }

  function handleCloseEditor() {
    selectedEntryId = null;
  }

  function handleEntrySaved(data: { id: string }) {
    // Refresh the entries list
    loadEntries();
  }

  async function handleEntryDecrypted(data: { id: string }) {
    // Small delay to ensure metadata update is complete
    setTimeout(() => {
      loadEntries();
    }, 100);
  }

  function handleEditorError(data: { title: string; message: string }) {
    const { title, message } = data;
    showDialog({
      title,
      message,
      type: 'error'
    });
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
        showDialog({
          title: 'Creation Failed',
          message: 'Failed to create entry. Please try again.',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Create error:', error);
      showDialog({
        title: 'Creation Failed',
        message: 'Failed to create entry. Please try again.',
        type: 'error'
      });
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

  function handleOpenBatchUnlock() {
    showBatchUnlock = true;
  }

  function handleCloseBatchUnlock() {
    showBatchUnlock = false;
  }

  function handleBatchUnlockSuccess(unlockedCount: number) {
    // No need to manually refresh - metadata store will update automatically
    showDialog({
      title: 'Batch Unlock Successful',
      message: `Successfully unlocked ${unlockedCount} entries!`,
      type: 'info'
    });
  }

  function showDialog(options: {
    title: string;
    message: string;
    type?: 'info' | 'error' | 'warning' | 'confirm';
    confirmText?: string;
    cancelText?: string;
    onconfirm?: () => void;
    oncancel?: () => void;
  }) {
    dialogState = {
      isVisible: true,
      title: options.title,
      message: options.message,
      type: options.type || 'info',
      confirmText: options.confirmText || 'OK',
      cancelText: options.cancelText || 'Cancel',
      onconfirm: options.onconfirm || null,
      oncancel: options.oncancel || null
    };
  }

  function closeDialog() {
    dialogState.isVisible = false;
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
          class="settings-btn"
          onclick={handleOpenBatchUnlock}
          aria-label="Batch unlock encrypted entries"
          title="Batch Unlock"
        >
          🔓
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
      onclose={handleCloseEditor}
      onsaved={handleEntrySaved}
      ondecrypted={handleEntryDecrypted}
      onerror={handleEditorError}
    />
  </main>
</main>

{#if showSettings}
  <Settings onclose={handleCloseSettings} />
{/if}

{#if showBatchUnlock}
  <BatchUnlock 
    isVisible={showBatchUnlock}
    onclose={handleCloseBatchUnlock}
    onunlock={handleBatchUnlockSuccess}
  />
{/if}

<Dialog 
  isVisible={dialogState.isVisible}
  title={dialogState.title}
  message={dialogState.message}
  type={dialogState.type}
  confirmText={dialogState.confirmText}
  cancelText={dialogState.cancelText}
  onconfirm={dialogState.onconfirm}
  oncancel={dialogState.oncancel}
  onclose={closeDialog}
/>

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
