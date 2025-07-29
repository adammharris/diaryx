<script lang="ts">
  let storageService = $state();
  let JournalEntryMetadata;
  import EntryCard from '../lib/components/EntryCard.svelte';
  import Editor from '../lib/components/Editor.svelte';
  import Settings from '../lib/components/Settings.svelte';
  import SharedEntries from '../lib/components/SharedEntries.svelte';
  import Dialog from '../lib/components/Dialog.svelte';
  import { currentTheme } from '../lib/stores/theme.js';
  import { detectTauri } from '../lib/utils/tauri.js';
  import { isKeyboardVisible, keyboardHeight } from '../lib/stores/keyboard.js';
  import { apiAuthService } from '../lib/services/api-auth.service.js';

  let entries: JournalEntryMetadata[] = $state([]);
  let preloadedEntry: JournalEntry | null = $state(null); // Store preloaded entry to avoid double-loading
  let selectedEntryId: string | null = $state(null);
  let isLoading = $state(true);
  let searchQuery = $state('');
  let isCreating = $state(false);
  let newEntryTitle = $state('');
  let showSettings = $state(false);
  let showSharedEntries = $state(false);
  let isTauri = $state(false);
  let reloadTimeout: number | null = null;
  let suppressedFiles = $state(new Map<string, { metadata: boolean; data: boolean }>());
  
  
  // Mobile view state
  let isMobile = $state(false);
  let mobileView = $state<'list' | 'editor' | 'settings'>('list');
  let innerHeight = $state(0);
  let innerWidth = $state(0);
  
  // Compute effective height based on keyboard visibility
  let effectiveHeight = $derived(() => {
    if (!isMobile) {
      return innerHeight;
    }
    
    let height = innerHeight;
    
    if ($isKeyboardVisible) {
      // For iOS Tauri, use the keyboard height from the plugin
      if ($keyboardHeight > 0) {
        height = innerHeight - $keyboardHeight;
        console.log('Using Tauri keyboard height:', $keyboardHeight, 'Adjusted height:', height);
      }
      // For Android web, use VirtualKeyboard API height if available
      else if (window.virtualKeyboardHeight > 0) {
        height = innerHeight - window.virtualKeyboardHeight;
        console.log('Using VirtualKeyboard API height:', window.virtualKeyboardHeight, 'Adjusted height:', height);
      }
      // For other platforms, use visual viewport
      else if (window.visualViewport) {
        const visualHeight = window.visualViewport.height;
        
        // Only use visual viewport if it's significantly smaller than window height
        if (visualHeight < innerHeight * 0.8) {
          height = visualHeight;
        }
      }
    }
    
    console.log('Effective height:', height, 'Keyboard visible:', $isKeyboardVisible, 'Keyboard height:', $keyboardHeight);
    return height;
  });

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

  $effect(() => {
    // Dynamically import the storage service on the client-side
    import('../lib/services/storage').then(module => {
      storageService = module.storageService;
      isTauri = storageService.environment === 'tauri'; // Set isTauri after storageService is available
      loadEntries();
      
      // Reload auth session from localStorage when page becomes visible
      // This handles the case where OAuth completes in another tab/redirect
      apiAuthService.reloadFromStorage();

      // Start file watching once when in Tauri mode
      if (isTauri) {
        console.log('Setting up file watcher...');
        storageService.startFileWatching(handleFileChange);
        
        // Set up global deep link handling for OAuth callbacks
        console.log('Setting up global deep link handler...');
        setupDeepLinkHandler();
        
        // Cleanup function to stop watching when component is destroyed
        // This return is for the inner effect, not the outer one
        // The outer effect's cleanup is handled by its own return
        return () => {
          if (storageService) {
            storageService.stopFileWatching();
          }
          
          // Clean up deep link listener
          if ((window as any).__deeplink_unlisten) {
            (window as any).__deeplink_unlisten();
          }
          
          // Clear any pending timeout
          if (reloadTimeout) {
            clearTimeout(reloadTimeout);
            reloadTimeout = null;
          }
        };
      }
    }).catch(error => {
      console.error('Failed to load storage service:', error);
      // Optionally show an error message to the user
    });

    // Listen for entries updates from E2E setup or other components
    function handleEntriesUpdated(event: CustomEvent) {
      console.log('Received entries-updated event:', event.detail);
      // Reload entries to reflect newly imported/decrypted entries
      loadEntries();
    }

    window.addEventListener('entries-updated', handleEntriesUpdated as EventListener);

    // This will trigger the theme initialization
    currentTheme.set($currentTheme);
    
    // Detect mobile viewport (reactive to innerWidth changes)
    isMobile = innerWidth <= 768;
    
    // Debug: Log height changes to verify reactivity
    console.log('Viewport dimensions:', innerWidth, 'x', innerHeight, 'Mobile:', isMobile);
    console.log('Effective height:', effectiveHeight, 'Using innerHeight:', innerHeight);
    
    // This return is for the outer effect
    return () => {
      // Remove event listener on cleanup
      window.removeEventListener('entries-updated', handleEntriesUpdated as EventListener);
    };
  });

  // Filtered entries based on search
  let filteredEntries = $derived(
    entries.filter(entry => 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.preview.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  

  // File watcher callback function (stable reference)
  function handleFileChange(changedFiles?: string[], eventType?: string) {
    console.log('File change detected (already debounced by watcher)', changedFiles, 'type:', eventType);
    
    // Track event types for suppressed files
    if (changedFiles && eventType) {
      changedFiles.forEach(filePath => {
        const fileName = filePath.split('/').pop() || '';
        const entryId = fileName.replace('.md', '');
        
        if (suppressedFiles.has(entryId)) {
          const tracking = suppressedFiles.get(entryId)!;
          if (eventType === 'metadata') {
            tracking.metadata = true;
          } else if (eventType === 'data') {
            tracking.data = true;
          }
        }
      });
    }
    
    // File system watcher now has built-in debouncing (500ms), so we can process immediately
    // Check if any of the changed files are ones we should suppress
    const hasUnsuppressedChanges = !changedFiles || changedFiles.some(filePath => {
      const fileName = filePath.split('/').pop() || '';
      const entryId = fileName.replace('.md', '');
      return !suppressedFiles.has(entryId);
    });
    
    if (!hasUnsuppressedChanges) {
      const suppressedFileNames = changedFiles?.filter(filePath => {
        const fileName = filePath.split('/').pop() || '';
        const entryId = fileName.replace('.md', '');
        return suppressedFiles.has(entryId);
      }).map(filePath => filePath.split('/').pop()) || [];
      
      console.log('Suppressing file watcher reload for internal saves:', suppressedFileNames, 'event type:', eventType);
      
      // Only clear suppressed files if we've seen both metadata and data events
      changedFiles?.forEach(filePath => {
        const fileName = filePath.split('/').pop() || '';
        const entryId = fileName.replace('.md', '');
        const tracking = suppressedFiles.get(entryId);
        
        if (tracking && tracking.metadata && tracking.data) {
          console.log('Clearing suppression for', entryId, '(seen both events)');
          suppressedFiles.delete(entryId);
        }
      });
      
      return;
    }
    
    console.log('Reloading entries due to external file change');
    loadEntries();
  }

  // Set up global deep link handler for OAuth callbacks
  async function setupDeepLinkHandler() {
    try {
      // Dynamically import the deep link module
      const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
      
      console.log('Setting up deep link listener...');
      
      // Listen for deep link activations
      const unlisten = await onOpenUrl((urls) => {
        console.log('🔗 Global deep link received:', urls);
        
        const url = urls[0];
        if (url && url.startsWith('diaryx://auth/callback')) {
          console.log('🔗 OAuth callback detected - checking if auth service is waiting for it...');
          
          // Check if the auth service has an active OAuth callback waiting
          const authCallback = (window as any).__auth_callback;
          if (authCallback && authCallback.handler) {
            console.log('🔗 Auth service is waiting for OAuth callback - delegating to it');
            authCallback.handler(url);
            return;
          }
          
          console.log('🔗 No active auth callback - handling OAuth callback in main page');
          // Fallback: handle in main page if auth service isn't waiting
          setTimeout(async () => {
            apiAuthService.reloadFromStorage();
            
            setTimeout(() => {
              const currentSession = apiAuthService.getCurrentSession();
              if (currentSession && currentSession.isAuthenticated) {
                showDialog({
                  title: 'Welcome Back!',
                  message: `Successfully signed in as ${currentSession.user.name || currentSession.user.email}`,
                  type: 'info'
                });
                loadEntries();
              } else {
                console.warn('Deep link callback processed but no session found');
              }
            }, 500);
          }, 1500);
        } else {
          console.log('🔗 Deep link received but not an OAuth callback:', url);
        }
      });
      
      // Store the unlisten function for cleanup
      (window as any).__deeplink_unlisten = unlisten;
      
    } catch (error) {
      console.warn('Deep link plugin not available:', error);
    }
  }

  

  async function loadEntries() {
    if (!storageService) {
      console.warn('Storage service not initialized yet');
      return;
    }
    
    isLoading = true;
    try {
      entries = await storageService.getAllEntries();
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


  async function handleSelectEntry(event: { id: string }) {
    console.log('handleSelectEntry called for id:', event.id);
    const entryId = event.id;
    
    try {
      // Get the entry
      const entry = await storageService.getEntry(entryId);
      if (!entry) {
        showDialog({
          title: 'Entry Not Found',
          message: 'The selected entry could not be found.',
          type: 'error'
        });
        return;
      }

      // Open editor directly (no encryption to handle)
      preloadedEntry = entry;
      selectedEntryId = entryId;
      
      // On mobile, navigate to editor view
      if (isMobile) {
        mobileView = 'editor';
      }
    } catch (error) {
      console.error('Error selecting entry:', error);
      showDialog({
        title: 'Error',
        message: 'Failed to open entry. Please try again.',
        type: 'error'
      });
    }
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
          const success = await storageService.deleteEntry(event.id);
          console.log('Delete result:', success);
          if (success) {
            // Remove from current entries array
            entries = entries.filter(e => e.id !== event.id);
            
            // Clear selection if the deleted entry was selected
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
    preloadedEntry = null; // Clear preloaded entry when editor closes
    
    // On mobile, navigate back to entry list
    if (isMobile) {
      mobileView = 'list';
    }
  }

  async function handleEntrySaved(data: { id: string; content: string }) {
    // Add this specific file to suppression list
    suppressedFiles.set(data.id, { metadata: false, data: false });
    
    // Update metadata for the entry (no encryption to worry about)
    try {
      await storageService.updateDecryptedTitle(data.id, data.content);
      console.log('Updated storage metadata for entry:', data.id);
    } catch (error) {
      console.error('Failed to update metadata:', error);
    }
    
    console.log('Entry saved, suppression set for', data.id);
  }


  async function handleEntryRenamed(data: { oldId: string; newId: string }) {
    // Update the selected entry ID if it was the one renamed
    if (selectedEntryId === data.oldId) {
      selectedEntryId = data.newId;
    }
    
    // Add both old and new files to suppression list (rename involves file operations)
    suppressedFiles.set(data.oldId, { metadata: false, data: false });
    suppressedFiles.set(data.newId, { metadata: false, data: false });
    
    // Refresh entries list to show new title
    await loadEntries();
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
      const id = await storageService.createEntry(newEntryTitle);
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
    console.log('handleOpenSettings called');
    if (isMobile) {
      mobileView = 'settings';
    } else {
      showSettings = true;
    }
  }

  function handleCloseSettings() {
    showSettings = false;
    
    // On mobile, navigate back to entry list
    if (isMobile) {
      mobileView = 'list';
    }
  }

  function handleOpenSharedEntries() {
    if (isMobile) {
      mobileView = 'shared';
    } else {
      showSharedEntries = true;
    }
  }

  function handleCloseSharedEntries() {
    showSharedEntries = false;
    
    // On mobile, navigate back to entry list
    if (isMobile) {
      mobileView = 'list';
    }
  }


  async function handlePublishToggle(event: { entryId: string; publish: boolean; tagIds?: string[] }) {
    const { entryId, publish, tagIds = [] } = event;
    
    try {
      if (publish) {
        // Publishing entry - sync to cloud with tags
        console.log('Publishing entry:', entryId, 'with tags:', tagIds);
        const success = await storageService.publishEntry(entryId, tagIds);
        
        if (success) {
          const tagMessage = tagIds.length > 0 
            ? ` Shared with ${tagIds.length} tag${tagIds.length > 1 ? 's' : ''}.`
            : '';
          showDialog({
            title: 'Published',
            message: `Entry published successfully!${tagMessage}`,
            type: 'info'
          });
        } else {
          showDialog({
            title: 'Publish Failed', 
            message: 'Failed to publish entry. Make sure you\'re signed in and E2E encryption is unlocked.',
            type: 'error'
          });
        }
      } else {
        // Unpublishing entry - remove from cloud but keep local
        console.log('Unpublishing entry:', entryId);
        const success = await storageService.unpublishEntry(entryId);
        
        if (success) {
          showDialog({
            title: 'Unpublished',
            message: 'Entry unpublished successfully!',
            type: 'info'
          });
        } else {
          showDialog({
            title: 'Unpublish Failed',
            message: 'Failed to unpublish entry. Please try again.',
            type: 'error'
          });
        }
      }
    } catch (error) {
      console.error('Publish toggle error:', error);
      showDialog({
        title: 'Error',
        message: 'An error occurred. Please try again.',
        type: 'error'
      });
    }
  }

  function handleKeyboardToggle(event: { visible: boolean }) {
    // This function is now deprecated since we're using the keyboard store
    // Keep for compatibility but don't use the event data
    console.log('Keyboard toggle event (deprecated):', event.visible);
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

<svelte:window bind:innerHeight bind:innerWidth />

<main class="app-container" class:mobile={isMobile} class:keyboard-animating={isMobile && $isKeyboardVisible && $keyboardHeight > 0} style={isMobile ? `height: ${$isKeyboardVisible ? ($keyboardHeight > 0 ? innerHeight - $keyboardHeight : (window.virtualViewport ? Math.min(window.visualViewport.height, innerHeight) : innerHeight)) : innerHeight}px;` : ''}>
  <!-- Mobile: Show different views based on mobileView state -->
  {#if isMobile}
    {#if mobileView === 'list'}
      <div class="mobile-view mobile-list">
        <div class="sidebar-header">
          <div class="header-content">
            <h1 class="app-title">Diaryx</h1>
            <p class="app-subtitle">Personal Journal</p>
          </div>
          <div class="header-buttons">
            <button 
              class="shared-btn"
              onclick={handleOpenSharedEntries}
              aria-label="View shared entries"
              title="Shared Entries"
            >
              🌐
            </button>
            <button 
              class="settings-btn"
              onclick={handleOpenSettings}
              aria-label="Open settings"
              title="Settings"
            >
              <img src="/material-symbols--settings.svg" class="icon" alt="Settings" />
            </button>
          </div>
        </div>

        <div class="new-entry">
          <input
            type="text"
            placeholder="New journal entry title..."
            bind:value={newEntryTitle}
            onkeydown={handleKeydownCreate}
            class="flex-1"
          />
          <button
            onclick={handleCreateEntry}
            disabled={isCreating || !newEntryTitle.trim()}
            class="btn btn-primary px-4 py-3 text-base font-medium min-w-12 touch-manipulation"
          >
            {isCreating ? '...' : '+'}
          </button>
        </div>

        <div class="search-container">
          <input
            type="text"
            placeholder="Search entries..."
            bind:value={searchQuery}
            class="w-full"
          />
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          {#if isLoading}
            <div class="flex items-center justify-center p-8 text-secondary text-center text-sm">Loading entries...</div>
          {:else if filteredEntries.length === 0}
            <div class="flex items-center justify-center p-8 text-secondary text-center text-sm leading-relaxed">
              {searchQuery ? 'No entries match your search' : 'No journal entries found. Create your first entry above!'}
            </div>
          {:else}
            <div class="flex flex-col">
              {#each filteredEntries as entry (entry.id)}
                <EntryCard 
                  {entry} 
                  onselect={handleSelectEntry}
                  ondelete={handleDeleteEntry}
                />
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {:else if mobileView === 'editor'}
      <div class="mobile-view mobile-editor">
        {#if storageService}
          <Editor 
            {storageService}
            entryId={selectedEntryId}
            preloadedEntry={preloadedEntry}
              onclose={handleCloseEditor}

            onsaved={handleEntrySaved}
            onrenamed={handleEntryRenamed}
            onpublishtoggle={handlePublishToggle}
            onerror={handleEditorError}
            onkeyboardtoggle={handleKeyboardToggle}
          />
        {:else}
          <div class="flex items-center justify-center p-8 text-secondary text-center text-sm">Loading storage service...</div>
        {/if}
      </div>
    {:else if mobileView === 'settings'}
      <div class="mobile-view mobile-settings">
        <Settings {storageService} onclose={handleCloseSettings} />
      </div>
    {:else if mobileView === 'shared'}
      <div class="mobile-view mobile-shared">
        <SharedEntries onclose={handleCloseSharedEntries} />
      </div>
    {/if}
  {:else}
    <!-- Desktop: Show sidebar and main content side by side -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="header-content">
          <h1 class="app-title">Diaryx</h1>
          <p class="app-subtitle">Personal Journal</p>
        </div>
        <div class="header-buttons">
          <button 
            class="shared-btn"
            onclick={handleOpenSharedEntries}
            aria-label="View shared entries"
            title="Shared Entries"
          >
            🌐
          </button>
          <button 
            class="settings-btn"
            onclick={handleOpenSettings}
            aria-label="Open settings"
            title="Settings"
          >
            <img src="/material-symbols--settings.svg" class="icon" alt="Settings" />
          </button>
        </div>
      </div>

      <div class="new-entry">
        <input
          type="text"
          placeholder="New journal entry title..."
          bind:value={newEntryTitle}
          onkeydown={handleKeydownCreate}
          class="flex-1"
        />
        <button
          onclick={handleCreateEntry}
          disabled={isCreating || !newEntryTitle.trim()}
          class="btn btn-primary px-4 py-3 text-base font-medium min-w-12 touch-manipulation"
        >
          {isCreating ? '...' : '+'}
        </button>
      </div>

      <div class="search-container">
        <input
          type="text"
          placeholder="Search entries..."
          bind:value={searchQuery}
          class="w-full"
        />
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        {#if isLoading}
          <div class="flex items-center justify-center p-8 text-secondary text-center text-sm">Loading entries...</div>
        {:else if filteredEntries.length === 0}
          <div class="flex items-center justify-center p-8 text-secondary text-center text-sm leading-relaxed">
            {searchQuery ? 'No entries match your search' : 'No journal entries found. Create your first entry above!'}
          </div>
        {:else}
          <div class="flex flex-col">
            {#each filteredEntries as entry (entry.id)}
              <EntryCard 
                {entry} 
                onselect={handleSelectEntry}
                ondelete={handleDeleteEntry}
              />
            {/each}
          </div>
        {/if}
      </div>
    </aside>

    <main class="flex-1 p-4 overflow-hidden">
      {#if storageService}
        <Editor 
          {storageService}
          entryId={selectedEntryId}
          preloadedEntry={preloadedEntry}
          onclose={handleCloseEditor}
          onsaved={handleEntrySaved}
          onrenamed={handleEntryRenamed}
          onpublishtoggle={handlePublishToggle}
          onerror={handleEditorError}
          onkeyboardtoggle={handleKeyboardToggle}
        />
      {:else}
        <div class="flex items-center justify-center p-8 text-secondary text-center text-sm">Loading storage service...</div>
      {/if}
    </main>
  {/if}
</main>

{#if showSettings && !isMobile}
  <Settings {storageService} onclose={handleCloseSettings} />
{/if}

{#if showSharedEntries && !isMobile}
  <SharedEntries onclose={handleCloseSharedEntries} />
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
  /* Main page styles with extracted CSS integration */
  
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--color-background, #f8fafc);
  }

  .app-container {
    display: flex;
    overflow: hidden;
  }

  /* Desktop fixed height */
  .app-container:not(.mobile) {
    height: 100vh;
    max-height: 100vh;
  }

  /* Mobile keyboard responsiveness */
  .app-container.mobile {
    /* Height set dynamically via JavaScript for keyboard handling */
    min-height: 0; /* Allow container to shrink when keyboard appears */
    flex-direction: column;
  }
  
  /* Smooth keyboard animation for iOS Tauri */
  .app-container.keyboard-animating {
    transition: height var(--keyboard-animation-duration, 0.25s) cubic-bezier(0.36, 0.66, 0.04, 1);
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

  .settings-btn,
  .shared-btn {
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
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .settings-btn:hover,
    .shared-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }

  .settings-btn .icon {
    width: 16px;
    height: 16px;
    filter: invert(1);
  }


  /* Form inputs - utilizing forms.css styles where possible */
  .new-entry {
    display: flex;
    padding: 1rem;
    gap: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .search-container {
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  /* Utility classes replace loading, no-entries, main-content, entries-container */

  /* Mobile-specific styles */
  .mobile-view {
    width: 100%;
    height: 100%; /* Inherit height from app-container */
    min-height: 0; /* Allow view to shrink when keyboard appears */
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .mobile-list {
    background: var(--color-surface, white);
  }

  .mobile-editor {
    background: var(--color-background, #f8fafc);
    padding: 0;
  }

  .mobile-settings {
    background: var(--color-surface, white);
  }

  .mobile-shared {
    background: var(--color-surface, white);
  }

  /* Mobile safe area adjustments */
  .mobile-view .sidebar-header {
    padding-top: calc(1.5rem + env(safe-area-inset-top));
    padding-left: calc(1.5rem + env(safe-area-inset-left));
    padding-right: calc(1.5rem + env(safe-area-inset-right));
  }

  /* Mobile safe area will be handled inline since we need to preserve the current structure */

  /* Responsive design - fallback for older approach */
  @media (max-width: 768px) {
    .app-container:not(.mobile) {
      flex-direction: column;
    }

    .app-container:not(.mobile) .sidebar {
      width: 100%;
      height: 50vh;
    }

    .app-container:not(.mobile) main {
      height: 50vh;
    }
  }
</style>
