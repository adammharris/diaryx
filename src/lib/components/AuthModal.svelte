<script lang="ts">
  import { authService } from '../services/auth.service.js';
  import type { AuthError } from '../services/auth.types.js';
  
  interface Props {
    open: boolean;
    onClose: () => void;
    mode?: 'signin' | 'signup';
  }
  
  let { open = $bindable(), onClose, mode = $bindable('signin') }: Props = $props();
  
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  
  async function handleGoogleSignIn() {
    if (loading) return;
    
    loading = true;
    error = null;
    
    try {
      await authService.signInWithGoogle();
      onClose();
    } catch (err) {
      error = (err as AuthError).message || 'Failed to sign in with Google';
    } finally {
      loading = false;
    }
  }
  
  async function handleGitHubSignIn() {
    if (loading) return;
    
    loading = true;
    error = null;
    
    try {
      await authService.signInWithGitHub();
      onClose();
    } catch (err) {
      error = (err as AuthError).message || 'Failed to sign in with GitHub';
    } finally {
      loading = false;
    }
  }
  
  async function handleEmailAuth() {
    if (loading || !email || !password) return;
    
    loading = true;
    error = null;
    
    try {
      if (mode === 'signup') {
        await authService.signUpWithEmail(email, password);
      } else {
        await authService.signInWithEmail(email, password);
      }
      onClose();
    } catch (err) {
      error = (err as AuthError).message || `Failed to ${mode === 'signup' ? 'sign up' : 'sign in'}`;
    } finally {
      loading = false;
    }
  }
  
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
  
  function resetForm() {
    email = '';
    password = '';
    error = null;
    loading = false;
  }
  
  $effect(() => {
    if (open) {
      resetForm();
    }
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="auth-modal-backdrop" 
    onclick={handleBackdropClick}
  >
    <div class="auth-modal">
      <div class="auth-modal-header">
        <h2>{mode === 'signup' ? 'Create Account' : 'Sign In'}</h2>
        <button 
          class="close-btn" 
          onclick={onClose}
          disabled={loading}
        >
          ×
        </button>
      </div>
      
      <div class="auth-modal-content">
        {#if error}
          <div class="error-message">
            {error}
          </div>
        {/if}
        
        <!-- Social Login Buttons -->
        <div class="social-auth">
          <button 
            class="social-btn google-btn"
            onclick={handleGoogleSignIn}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          
          <button 
            class="social-btn github-btn"
            onclick={handleGitHubSignIn}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Continue with GitHub
          </button>
        </div>
        
        <div class="divider">
          <span>or</span>
        </div>
        
        <!-- Email/Password Form -->
        <form onsubmit|preventDefault={handleEmailAuth} class="email-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input 
              id="email"
              type="email" 
              bind:value={email}
              placeholder="Enter your email"
              disabled={loading}
              required
            />
          </div>
          
          <div class="form-group">
            <label for="password">Password</label>
            <input 
              id="password"
              type="password" 
              bind:value={password}
              placeholder="Enter your password"
              disabled={loading}
              required
            />
          </div>
          
          <button 
            type="submit" 
            class="submit-btn"
            disabled={loading || !email || !password}
          >
            {loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>
        
        <div class="auth-toggle">
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
          <button 
            class="toggle-btn"
            onclick={() => mode = mode === 'signup' ? 'signin' : 'signup'}
            disabled={loading}
          >
            {mode === 'signup' ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .auth-modal-backdrop {
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
  
  .auth-modal {
    background: var(--surface-color, #ffffff);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    width: 100%;
    max-width: 400px;
    max-height: 90vh;
    overflow-y: auto;
  }
  
  .auth-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 1.5rem 0;
  }
  
  .auth-modal-header h2 {
    margin: 0;
    color: var(--text-color, #000000);
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-color-muted, #666666);
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }
  
  .close-btn:hover {
    background: var(--hover-color, #f0f0f0);
  }
  
  .auth-modal-content {
    padding: 1.5rem;
  }
  
  .error-message {
    background: #fee;
    color: #c33;
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  
  .social-auth {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  
  .social-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 6px;
    background: var(--surface-color, #ffffff);
    color: var(--text-color, #000000);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .social-btn:hover:not(:disabled) {
    background: var(--hover-color, #f8f9fa);
    border-color: var(--border-color-hover, #d0d0d0);
  }
  
  .social-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .divider {
    text-align: center;
    margin: 1.5rem 0;
    position: relative;
    color: var(--text-color-muted, #666666);
    font-size: 0.875rem;
  }
  
  .divider::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--border-color, #e0e0e0);
  }
  
  .divider span {
    background: var(--surface-color, #ffffff);
    padding: 0 1rem;
  }
  
  .email-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-color, #000000);
  }
  
  .form-group input {
    padding: 0.75rem;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 6px;
    font-size: 0.875rem;
    background: var(--surface-color, #ffffff);
    color: var(--text-color, #000000);
  }
  
  .form-group input:focus {
    outline: none;
    border-color: var(--accent-color, #007acc);
    box-shadow: 0 0 0 3px rgba(0, 122, 204, 0.1);
  }
  
  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .submit-btn {
    padding: 0.75rem;
    background: var(--accent-color, #007acc);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  
  .submit-btn:hover:not(:disabled) {
    background: var(--accent-color-hover, #005a9e);
  }
  
  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .auth-toggle {
    text-align: center;
    margin-top: 1.5rem;
    font-size: 0.875rem;
    color: var(--text-color-muted, #666666);
  }
  
  .toggle-btn {
    background: none;
    border: none;
    color: var(--accent-color, #007acc);
    cursor: pointer;
    font-size: inherit;
    text-decoration: underline;
    margin-left: 0.25rem;
  }
  
  .toggle-btn:hover:not(:disabled) {
    color: var(--accent-color-hover, #005a9e);
  }
  
  .toggle-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>