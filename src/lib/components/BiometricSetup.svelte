<script lang="ts">
  import { e2eEncryptionService } from '../services/e2e-encryption.service.js';
  import { biometricAuthService } from '../services/biometric-auth.service.js';

  interface Props {
    onclose?: () => void;
  }

  let { onclose }: Props = $props();

  let isSupported = $state(false);
  let isEnabled = $state(false);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let password = $state('');
  let credentialInfo = $state<any>(null);

  // Check biometric support and status on mount
  async function checkBiometricStatus() {
    isLoading = true;
    try {
      isSupported = await e2eEncryptionService.isBiometricAvailable();
      isEnabled = e2eEncryptionService.isBiometricEnabled();
      
      if (isEnabled) {
        const info = e2eEncryptionService.getBiometricInfo();
        credentialInfo = info.credentialInfo;
      }
    } catch (err) {
      console.error('Failed to check biometric status:', err);
      error = 'Failed to check biometric status';
    } finally {
      isLoading = false;
    }
  }

  // Initialize on component mount
  $effect(() => {
    checkBiometricStatus();
  });

  async function enableBiometric() {
    if (!password.trim()) {
      error = 'Please enter your encryption password';
      return;
    }

    isLoading = true;
    error = null;
    success = null;

    try {
      const enabled = await e2eEncryptionService.enableBiometric(password);
      
      if (enabled) {
        success = 'Biometric authentication enabled successfully!';
        isEnabled = true;
        password = ''; // Clear password
        
        // Update credential info
        const info = e2eEncryptionService.getBiometricInfo();
        credentialInfo = info.credentialInfo;
      } else {
        error = 'Failed to enable biometric authentication. Please check your password and try again.';
      }
    } catch (err) {
      console.error('Failed to enable biometric authentication:', err);
      error = err instanceof Error ? err.message : 'An unexpected error occurred';
    } finally {
      isLoading = false;
    }
  }

  async function disableBiometric() {
    isLoading = true;
    error = null;
    success = null;

    try {
      const disabled = e2eEncryptionService.disableBiometric();
      
      if (disabled) {
        success = 'Biometric authentication disabled successfully.';
        isEnabled = false;
        credentialInfo = null;
      } else {
        error = 'Failed to disable biometric authentication.';
      }
    } catch (err) {
      console.error('Failed to disable biometric authentication:', err);
      error = err instanceof Error ? err.message : 'An unexpected error occurred';
    } finally {
      isLoading = false;
    }
  }

  async function testBiometric() {
    isLoading = true;
    error = null;
    success = null;

    try {
      const result = await biometricAuthService.authenticate();
      
      if (result.success) {
        success = 'Biometric authentication test successful!';
      } else {
        error = result.error || 'Biometric authentication test failed';
      }
    } catch (err) {
      console.error('Biometric test failed:', err);
      error = err instanceof Error ? err.message : 'Biometric test failed';
    } finally {
      isLoading = false;
    }
  }

  function handleClose() {
    onclose?.();
  }

  function clearMessages() {
    error = null;
    success = null;
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="modal-overlay">
  <div class="modal-content biometric-setup-modal">
    <div class="modal-header">
      <h2 class="modal-title">🔐 Biometric Authentication</h2>
      <button 
        class="close-btn"
        onclick={handleClose}
        aria-label="Close biometric setup"
      >
        ×
      </button>
    </div>

    <div class="modal-body">
      {#if isLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Setting up biometric authentication...</p>
        </div>
      {:else if !isSupported}
        <div class="not-supported">
          <div class="status-icon">⚠️</div>
          <h3>Biometric Authentication Not Available</h3>
          <p>Your device doesn't support biometric authentication, or no biometric authenticators are set up.</p>
          <div class="requirements">
            <h4>Requirements:</h4>
            <ul>
              <li>Modern browser with WebAuthn support</li>
              <li>Device with biometric hardware (fingerprint reader, facial recognition, etc.)</li>
              <li>Biometric authentication enabled in your device settings</li>
            </ul>
          </div>
          <div class="actions">
            <button class="btn btn-secondary" onclick={handleClose}>
              Close
            </button>
          </div>
        </div>
      {:else}
        <div class="biometric-setup">
          <div class="status-section">
            <h3>Status</h3>
            <div class="status-info">
              <div class="status-item">
                <span class="status-label">Device Support:</span>
                <span class="status-value supported">✅ Available</span>
              </div>
              <div class="status-item">
                <span class="status-label">Current Status:</span>
                <span class="status-value {isEnabled ? 'enabled' : 'disabled'}">
                  {isEnabled ? '🔓 Enabled' : '🔒 Disabled'}
                </span>
              </div>
              {#if isEnabled && credentialInfo}
                <div class="status-item">
                  <span class="status-label">Setup Date:</span>
                  <span class="status-value">{formatDate(credentialInfo.created)}</span>
                </div>
              {/if}
            </div>
          </div>

          {#if error}
            <div class="message error-message">
              <span class="message-icon">❌</span>
              <span class="message-text">{error}</span>
              <button class="message-close" onclick={clearMessages}>×</button>
            </div>
          {/if}

          {#if success}
            <div class="message success-message">
              <span class="message-icon">✅</span>
              <span class="message-text">{success}</span>
              <button class="message-close" onclick={clearMessages}>×</button>
            </div>
          {/if}

          {#if !isEnabled}
            <div class="enable-section">
              <h3>Enable Biometric Authentication</h3>
              <p>Use your device's biometric authentication (fingerprint, face recognition, etc.) to automatically unlock your encryption password.</p>
              
              <div class="benefits">
                <h4>Benefits:</h4>
                <ul>
                  <li>No need to enter your password every session</li>
                  <li>Hardware-backed security when available</li>
                  <li>Quick and convenient access</li>
                  <li>Your password is encrypted and stored securely</li>
                </ul>
              </div>

              <div class="password-input">
                <label for="password">Enter your encryption password to enable biometric authentication:</label>
                <input
                  id="password"
                  type="password"
                  bind:value={password}
                  placeholder="Enter your encryption password"
                  class="form-input"
                  disabled={isLoading}
                  onkeydown={(e) => e.key === 'Enter' && enableBiometric()}
                />
              </div>

              <div class="actions">
                <button 
                  class="btn btn-primary"
                  onclick={enableBiometric}
                  disabled={isLoading || !password.trim()}
                >
                  {isLoading ? 'Setting up...' : 'Enable Biometric Authentication'}
                </button>
                <button class="btn btn-secondary" onclick={handleClose}>
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="manage-section">
              <h3>Manage Biometric Authentication</h3>
              <p>Biometric authentication is currently enabled. You can test it or disable it below.</p>

              <div class="actions">
                <button 
                  class="btn btn-secondary"
                  onclick={testBiometric}
                  disabled={isLoading}
                >
                  {isLoading ? 'Testing...' : 'Test Biometric Authentication'}
                </button>
                <button 
                  class="btn btn-danger"
                  onclick={disableBiometric}
                  disabled={isLoading}
                >
                  {isLoading ? 'Disabling...' : 'Disable Biometric Authentication'}
                </button>
                <button class="btn btn-primary" onclick={handleClose}>
                  Done
                </button>
              </div>
            </div>
          {/if}

          <div class="security-note">
            <h4>Security Note</h4>
            <p>Your encryption password is encrypted using your device's biometric data and stored locally. The password never leaves your device and can only be decrypted with your biometric authentication.</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-overlay {
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

  .biometric-setup-modal {
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .modal-content {
    background: var(--color-surface);
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .modal-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--color-background);
  }

  .modal-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-textSecondary);
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .close-btn:hover {
    background: var(--color-border);
  }

  .modal-body {
    padding: 1.5rem;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .loading-state,
  .not-supported {
    text-align: center;
    padding: 2rem;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid var(--color-border);
    border-top: 3px solid var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .status-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .not-supported h3,
  .biometric-setup h3 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    color: var(--color-text);
  }

  .not-supported p,
  .biometric-setup p {
    margin: 0 0 1rem 0;
    color: var(--color-textSecondary);
    line-height: 1.5;
  }

  .requirements {
    text-align: left;
    margin: 1.5rem 0;
    padding: 1rem;
    background: var(--color-background);
    border-radius: 8px;
  }

  .requirements h4,
  .benefits h4,
  .security-note h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: var(--color-text);
  }

  .requirements ul,
  .benefits ul {
    margin: 0;
    padding-left: 1.25rem;
    color: var(--color-textSecondary);
  }

  .requirements li,
  .benefits li {
    margin-bottom: 0.25rem;
  }

  .status-section {
    margin-bottom: 1.5rem;
  }

  .status-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: var(--color-background);
    border-radius: 6px;
  }

  .status-label {
    font-weight: 500;
    color: var(--color-text);
  }

  .status-value {
    font-weight: 500;
  }

  .status-value.supported {
    color: var(--color-success, #10b981);
  }

  .status-value.enabled {
    color: var(--color-success, #10b981);
  }

  .status-value.disabled {
    color: var(--color-textSecondary);
  }

  .message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin: 1rem 0;
    position: relative;
  }

  .error-message {
    background: var(--color-error-bg, #fef2f2);
    border: 1px solid var(--color-error-border, #fecaca);
    color: var(--color-error-text, #dc2626);
  }

  .success-message {
    background: var(--color-success-bg, #f0fdf4);
    border: 1px solid var(--color-success-border, #bbf7d0);
    color: var(--color-success-text, #16a34a);
  }

  .message-text {
    flex: 1;
  }

  .message-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.25rem;
    opacity: 0.7;
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .message-close:hover {
    opacity: 1;
  }

  .enable-section,
  .manage-section {
    margin-bottom: 1.5rem;
  }

  .benefits {
    margin: 1rem 0;
    padding: 1rem;
    background: var(--color-background);
    border-radius: 8px;
  }

  .password-input {
    margin: 1.5rem 0;
  }

  .password-input label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .form-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-background);
    color: var(--color-text);
    font-size: 1rem;
    transition: border-color 0.2s;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .form-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primaryHover);
  }

  .btn-secondary {
    background: var(--color-border);
    color: var(--color-text);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-borderHover);
  }

  .btn-danger {
    background: var(--color-error, #dc2626);
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--color-errorHover, #b91c1c);
  }

  .security-note {
    margin-top: 2rem;
    padding: 1rem;
    background: var(--color-background);
    border-radius: 8px;
    border-left: 4px solid var(--color-primary);
  }

  .security-note p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-textSecondary);
    line-height: 1.4;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .modal-overlay {
      padding: 0;
    }

    .biometric-setup-modal {
      max-width: 100%;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
    }

    .modal-header {
      padding: 1rem;
      padding-top: calc(1rem + env(safe-area-inset-top));
    }

    .status-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }

    .actions {
      flex-direction: column;
    }

    .btn {
      width: 100%;
    }
  }
</style>