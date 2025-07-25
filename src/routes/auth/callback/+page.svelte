<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { apiAuthService } from '$lib/services/api-auth.service.js';
  import { goto } from '$app/navigation';

  let status = 'processing'; // 'processing', 'success', 'error'
  let message = 'Processing authentication...';

  onMount(() => {
    if (browser) {
      handleCallback();
    }
  });

  async function handleCallback() {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code || !state) {
        throw new Error('Missing authorization code or state');
      }

      // Check if this is a popup window (legacy web OAuth)
      if (window.opener) {
        handlePopupCallback(code, state);
        return;
      }

      // Handle direct callback (web app navigation)
      await handleDirectCallback(code, state);

    } catch (error) {
      console.error('Callback handling failed:', error);
      status = 'error';
      message = error.message;
      
      // If it's a popup, notify the parent
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth_error', error: error.message });
        window.close();
      }
    }
  }

  function handlePopupCallback(code, state) {
    // Legacy popup-based OAuth flow
    const redirectUri = `${window.location.origin}/auth/callback`;
    
    // Validate state
    const originalState = window.opener.sessionStorage.getItem('oauth_state');
    if (state !== originalState) {
      window.opener.postMessage({ type: 'oauth_error', error: 'Invalid state parameter' });
      window.close();
      return;
    }

    // Exchange code for token via backend
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const apiUrl = apiBaseUrl ? `${apiBaseUrl}/api/auth/callback` : '/api/auth/google';
    
    console.log('Making popup auth request to:', apiUrl);
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code, state, redirectUri })
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Token exchange failed') });
      }
      return response.json();
    })
    .then(result => {
      window.opener.postMessage({ type: 'oauth_success', result: result.data });
      window.close();
    })
    .catch(error => {
      window.opener.postMessage({ type: 'oauth_error', error: error.message });
      window.close();
    });
  }

  async function handleDirectCallback(code, state) {
    // Direct web app callback (not popup)
    try {
      status = 'processing';
      message = 'Completing authentication...';

      // For Tauri deep-link flow, we skip state validation since the state
      // was generated in the Tauri app, not in this browser session
      const isFromTauriDeepLink = !sessionStorage.getItem('oauth_state');
      
      if (!isFromTauriDeepLink) {
        // Validate state for normal web flow
        const storedState = sessionStorage.getItem('oauth_state');
        if (state !== storedState) {
          throw new Error('Invalid OAuth state parameter');
        }
      }

      // Exchange code for token via backend
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const apiUrl = apiBaseUrl ? `${apiBaseUrl}/api/auth/google` : '/api/auth/google';
      const redirectUri = `${window.location.origin}/auth/callback`;
      
      console.log('Making direct auth request to:', apiUrl);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code, state, redirectUri })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Authentication failed');
      }

      const result = await response.json();
      
      // Process the auth result and save session
      const user = {
        id: result.data.user.id,
        email: result.data.user.email,
        name: result.data.user.name,
        avatar: result.data.user.avatar,
        provider: result.data.user.provider,
        public_key: result.data.user.public_key
      };

      const session = {
        user,
        accessToken: result.data.access_token,
        isAuthenticated: true
      };

      // Save to localStorage and update the auth service
      localStorage.setItem('diaryx_auth_session', JSON.stringify(session));
      
      // Update the auth service (this will update both store and internal state)
      apiAuthService.setSession(session);

      if (isFromTauriDeepLink) {
        // For Tauri deep-link flow, trigger the deep link to return to app
        status = 'success';
        message = 'Authentication successful! Opening Diaryx app...';
        
        const deepLinkUrl = `diaryx://auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        
        try {
          window.location.href = deepLinkUrl;
          
          // Show manual option after a delay in case auto-open doesn't work
          setTimeout(() => {
            status = 'success';
            message = 'Click the button below if the app doesn\'t open automatically:';
            
            // Add manual link
            const container = document.querySelector('.callback-content');
            if (container && !document.getElementById('manual-link')) {
              const linkButton = document.createElement('a');
              linkButton.id = 'manual-link';
              linkButton.href = deepLinkUrl;
              linkButton.textContent = 'Open Diaryx App';
              linkButton.style.cssText = `
                display: inline-block;
                margin-top: 1rem;
                padding: 0.75rem 1.5rem;
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                color: white;
                text-decoration: none;
                transition: background-color 0.2s;
              `;
              container.appendChild(linkButton);
            }
          }, 3000);
          
        } catch (err) {
          status = 'error';
          message = 'Failed to open the Diaryx app automatically.';
        }
      } else {
        // For normal web flow, redirect to home page
        status = 'success';
        message = 'Authentication successful! Redirecting...';

        // Clean up and redirect
        sessionStorage.removeItem('oauth_state');
        setTimeout(() => {
          console.log('Redirecting to home page...');
          goto('/');
        }, 2000);
      }

    } catch (error) {
      console.error('Direct callback failed:', error);
      status = 'error';
      message = error.message;
    }
  }
</script>

<div class="callback-container">
  <div class="callback-content">
    {#if status === 'processing'}
      <div class="spinner"></div>
      <h2>Authenticating...</h2>
      <p>{message}</p>
    {:else if status === 'success'}
      <div class="success-icon">✅</div>
      <h2>Success!</h2>
      <p>{message}</p>
    {:else if status === 'error'}
      <div class="error-icon">❌</div>
      <h2>Authentication Failed</h2>
      <p>{message}</p>
      <button onclick={() => goto('/')}>Return to App</button>
    {/if}
  </div>
</div>

<style>
  .callback-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--color-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .callback-content {
    text-align: center;
    background: rgba(255, 255, 255, 0.1);
    padding: 2rem;
    border-radius: 12px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    max-width: 400px;
    width: 90%;
  }

  .spinner {
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid white;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .success-icon, .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
  }

  p {
    margin: 0 0 1rem 0;
    opacity: 0.9;
  }

  button {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    color: white;
    padding: 0.75rem 1.5rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  button:hover {
    background: rgba(255, 255, 255, 0.3);
  }
</style> 