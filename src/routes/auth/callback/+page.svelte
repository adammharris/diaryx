<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  
  onMount(async () => {
    // Handle OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    // Validate state parameter
    const storedState = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');
    
    if (error) {
      // Send error to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth_error',
          error: error
        }, window.location.origin);
      }
      window.close();
      return;
    }
    
    if (!code || !state || state !== storedState) {
      // Send error to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth_error',
          error: 'Invalid OAuth response'
        }, window.location.origin);
      }
      window.close();
      return;
    }
    
    try {
      // Send authorization code to backend for token exchange
      console.log('Processing OAuth callback with code:', code);
      
      const apiUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiUrl}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, state })
      });

      if (!response.ok) {
        throw new Error(`OAuth exchange failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'OAuth exchange failed');
      }

      const userData = result.data;
      
      // Send success to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth_success',
          result: userData
        }, window.location.origin);
      }
      
    } catch (error) {
      console.error('OAuth processing failed:', error);
      
      // Send error to parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth_error',
          error: error.message
        }, window.location.origin);
      }
    }
    
    window.close();
  });
</script>

<div class="oauth-callback">
  <div class="loading">
    <div class="spinner"></div>
    <p>Completing sign in...</p>
  </div>
</div>

<style>
  .oauth-callback {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #f8fafc;
  }
  
  .loading {
    text-align: center;
    padding: 2rem;
  }
  
  .spinner {
    width: 3rem;
    height: 3rem;
    border: 3px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  p {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 0;
  }
</style>