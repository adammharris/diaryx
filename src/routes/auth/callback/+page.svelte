<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  onMount(() => {
    if (browser) {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      // --- CHANGE 1: Define the redirectUri here ---
      const redirectUri = `${window.location.origin}/auth/callback`;

      if (window.opener) {
        // --- CHANGE 2: Check for the 'oauth_state' from the main window ---
        const originalState = window.opener.sessionStorage.getItem('oauth_state');
        if (state !== originalState) {
          window.opener.postMessage({ type: 'oauth_error', error: 'Invalid state parameter' });
          window.close();
          return;
        }

        if (code) {
          // Exchange code for token via your backend API
          const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
          const apiUrl = apiBaseUrl ? `${apiBaseUrl}api/auth/google` : '/api/auth/google';
          
          console.log('Making auth request to:', apiUrl);
          fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            // --- CHANGE 3: Send the code AND the redirectUri ---
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
      }
    }
  });
</script>

<p>Authenticating, please wait...</p> 