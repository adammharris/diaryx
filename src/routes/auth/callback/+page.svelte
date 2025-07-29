<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { VITE_API_BASE_URL, VITE_GOOGLE_REDIRECT_URI } from '$lib/config/env-validation.js';

  // --- CONFIGURATION ---
  // Environment variables are validated at build time
  const REDIRECT_URI = VITE_GOOGLE_REDIRECT_URI;

  // --- Svelte State ---
  let status = 'processing'; // 'processing', 'success', 'error'
  let message = 'Processing authentication...';

  onMount(() => {
    // The entire process must run in the browser
    if (browser) {
      handleCallback();
    }
  });

  async function handleCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Check if this is a Tauri deep link callback by looking at the user agent or URL
    const isTauriCallback = detectTauriCallback();

    if (isTauriCallback) {
      await handleTauriCallback(code, state, error);
    } else {
      await handleWebCallback(code, state, error);
    }
  }

  function detectTauriCallback() {
    // Check if we're in a browser being called from Tauri
    // This can be detected by checking if the referrer suggests Tauri origin
    // or by looking for specific URL patterns
    const userAgent = navigator.userAgent;
    const referrer = document.referrer;
    
    // Check if this might be a Tauri external browser callback
    // We can detect this by seeing if we have no referrer (external browser)
    // and the URL contains the callback path
    return !referrer || referrer === '' || userAgent.includes('Chrome') || userAgent.includes('Safari');
  }

  async function handleTauriCallback(code, state, error) {
    try {
      if (error) {
        throw new Error(`OAuth Error: ${error}`);
      }
      if (!code) {
        throw new Error('Authorization code not found in URL.');
      }

      // For Tauri, we need to redirect back to the app via deep link
      // The app will handle the actual token exchange
      const deepLinkUrl = new URL('diaryx://auth/callback');
      deepLinkUrl.searchParams.set('code', code);
      if (state) deepLinkUrl.searchParams.set('state', state);

      status = 'success';
      message = 'Redirecting back to the app...';

      // Redirect to the deep link
      window.location.href = deepLinkUrl.toString();

      // Fallback: show instructions if deep link doesn't work
      setTimeout(() => {
        if (status === 'success') {
          message = 'Please return to the Diaryx app to complete authentication.';
        }
      }, 3000);

    } catch (err) {
      console.error('Tauri callback handling failed:', err);
      status = 'error';
      message = err instanceof Error ? err.message : 'An unknown error occurred';
    }
  }

  async function handleWebCallback(code, state, error) {
    // Retrieve the verifier that the login page should have stored
    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

    try {
      if (error) {
        throw new Error(`OAuth Error: ${error}`);
      }
      if (!code) {
        throw new Error('Authorization code not found in URL. Please try logging in again.');
      }
      if (!codeVerifier) {
        throw new Error('Security code verifier not found. Please start the login process again.');
      }

      // Exchange the authorization code for an access token via your backend
      const tokenUrl = `${VITE_API_BASE_URL}/auth/google`;
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
          codeVerifier: codeVerifier,
          redirectUri: REDIRECT_URI
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || 'Failed to exchange code for token.');
      }

      // --- SUCCESS ---
      // Create the session object that the app expects
      const session = {
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          avatar: data.user.avatar,
          provider: data.user.provider || 'google',
          public_key: data.user.public_key
        },
        accessToken: data.access_token,
        isAuthenticated: true
      };

      // Store the session with the expected key
      localStorage.setItem('diaryx_auth_session', JSON.stringify(session));
      
      // Import and notify the auth service about the new session
      const { apiAuthService } = await import('$lib/services/api-auth.service.js');
      apiAuthService.reloadFromStorage();

      status = 'success';
      message = 'Authentication successful! Redirecting...';

      // Redirect to the main application page after a short delay
      setTimeout(() => {
        goto('/');
      }, 2000);

    } catch (err) {
      console.error('Web callback handling failed:', err);
      status = 'error';
      message = err instanceof Error ? err.message : 'An unknown error occurred';
    } finally {
      // Clean up the verifier from session storage for security
      sessionStorage.removeItem('pkce_code_verifier');
    }
  }
</script>

<!-- This is your original HTML structure, it works perfectly! -->
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
      <button on:click={() => goto('/')}>Return to App</button>
    {/if}
  </div>
</div>

<!-- This is your original CSS, it also works perfectly! -->
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
