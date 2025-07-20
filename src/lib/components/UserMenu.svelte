<script lang="ts">
  import { authService, authStore } from '../services/auth.service.js';
  import type { User } from '../services/auth.types.js';
  
  interface Props {
    onSignInClick: () => void;
  }
  
  let { onSignInClick }: Props = $props();
  
  let showDropdown = $state(false);
  let user = $derived($authStore?.user || null);
  
  async function handleSignOut() {
    try {
      await authService.signOut();
      showDropdown = false;
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  }
  
  function handleBackdropClick(event: MouseEvent) {
    if (!event.target?.closest?.('.user-menu')) {
      showDropdown = false;
    }
  }
  
  function getInitials(user: User): string {
    if (user.name) {
      return user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  }
  
  function formatProvider(provider?: string): string {
    if (!provider) return '';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:window onclick={handleBackdropClick} />

<div class="user-menu">
  {#if user}
    <button 
      class="user-button"
      onclick={() => showDropdown = !showDropdown}
    >
      {#if user.avatar}
        <img 
          src={user.avatar} 
          alt={user.name || user.email || 'User'}
          class="user-avatar"
        />
      {:else}
        <div class="user-avatar-fallback">
          {getInitials(user)}
        </div>
      {/if}
      
      <svg 
        class="dropdown-icon" 
        class:rotated={showDropdown}
        width="16" 
        height="16" 
        viewBox="0 0 16 16"
      >
        <path 
          fill="currentColor" 
          d="M4.427 9.573l3.396-3.396a.25.25 0 01.354 0l3.396 3.396a.25.25 0 01-.177.427H4.604a.25.25 0 01-.177-.427z"
        />
      </svg>
    </button>
    
    {#if showDropdown}
      <div class="user-dropdown">
        <div class="user-info">
          <div class="user-name">
            {user.name || user.email || 'Unknown User'}
          </div>
          {#if user.email && user.name}
            <div class="user-email">{user.email}</div>
          {/if}
          {#if user.provider}
            <div class="user-provider">
              via {formatProvider(user.provider)}
            </div>
          {/if}
        </div>
        
        <div class="dropdown-divider"></div>
        
        <button class="dropdown-item" onclick={() => showDropdown = false}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
            <path fill="currentColor" d="M8 0a8 8 0 108 8A8.009 8.009 0 008 0zM8 12a4 4 0 114-4 4.005 4.005 0 01-4 4z"/>
          </svg>
          Settings
        </button>
        
        <button class="dropdown-item" onclick={() => showDropdown = false}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 15A7 7 0 118 1a7 7 0 010 14zm0 1A8 8 0 108 0a8 8 0 000 16z"/>
            <path fill="currentColor" d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 11-2 0 1 1 0 012 0z"/>
          </svg>
          Help
        </button>
        
        <div class="dropdown-divider"></div>
        
        <button class="dropdown-item sign-out" onclick={handleSignOut}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M10 12.5a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5h8a.5.5 0 01.5.5v2a.5.5 0 001 0v-2A1.5 1.5 0 009.5 2h-8A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h8a1.5 1.5 0 001.5-1.5v-2a.5.5 0 00-1 0v2z"/>
            <path fill="currentColor" d="M15.854 8.354a.5.5 0 000-.708l-3-3a.5.5 0 00-.708.708L14.293 7.5H5.5a.5.5 0 000 1h8.793l-2.147 2.146a.5.5 0 00.708.708l3-3z"/>
          </svg>
          Sign Out
        </button>
      </div>
    {/if}
  {:else}
    <button class="sign-in-button" onclick={onSignInClick}>
      Sign In
    </button>
  {/if}
</div>

<style>
  .user-menu {
    position: relative;
    display: inline-block;
  }
  
  .user-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--surface-color, #ffffff);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .user-button:hover {
    background: var(--hover-color, #f8f9fa);
    border-color: var(--border-color-hover, #d0d0d0);
  }
  
  .user-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    object-fit: cover;
  }
  
  .user-avatar-fallback {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--accent-color, #007acc);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
  }
  
  .dropdown-icon {
    color: var(--text-color-muted, #666666);
    transition: transform 0.2s ease;
  }
  
  .dropdown-icon.rotated {
    transform: rotate(180deg);
  }
  
  .user-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    background: var(--surface-color, #ffffff);
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    min-width: 200px;
    z-index: 100;
  }
  
  .user-info {
    padding: 1rem;
  }
  
  .user-name {
    font-weight: 500;
    color: var(--text-color, #000000);
    font-size: 0.875rem;
  }
  
  .user-email {
    color: var(--text-color-muted, #666666);
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }
  
  .user-provider {
    color: var(--text-color-muted, #666666);
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }
  
  .dropdown-divider {
    height: 1px;
    background: var(--border-color, #e0e0e0);
    margin: 0.5rem 0;
  }
  
  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    text-align: left;
    color: var(--text-color, #000000);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  
  .dropdown-item:hover {
    background: var(--hover-color, #f8f9fa);
  }
  
  .dropdown-item:first-of-type {
    border-radius: 6px 6px 0 0;
  }
  
  .dropdown-item:last-of-type {
    border-radius: 0 0 6px 6px;
  }
  
  .dropdown-item.sign-out {
    color: #dc3545;
  }
  
  .dropdown-item.sign-out:hover {
    background: #fff5f5;
  }
  
  .sign-in-button {
    padding: 0.5rem 1rem;
    background: var(--accent-color, #007acc);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  
  .sign-in-button:hover {
    background: var(--accent-color-hover, #005a9e);
  }
</style>