<script lang="ts">
    import { e2eEncryptionService, e2eSessionStore } from '../services/e2e-encryption.service.js';
    import { apiAuthService } from '../services/api-auth.service.js';

    interface Props {
        onclose: () => void;
        onSetupComplete: () => void;
    }

    let { onclose, onSetupComplete }: Props = $props();

    // Setup state
    let setupStep = $state<'intro' | 'password' | 'confirm' | 'generating' | 'success' | 'existing'>('intro');
    let password = $state('');
    let confirmPassword = $state('');
    let error = $state('');
    let isLoading = $state(false);

    // Derived state
    let e2eSession = $derived($e2eSessionStore);
    let currentUser = $derived(apiAuthService.getCurrentUser());
    let hasStoredKeys = $derived(e2eEncryptionService.hasStoredKeys());

    // Initialize setup based on current state
    $effect(() => {
        if (hasStoredKeys && !e2eSession?.isUnlocked) {
            setupStep = 'existing';
        } else if (e2eSession?.isUnlocked) {
            setupStep = 'success';
        } else {
            // Check for cloud keys if no local keys and user is authenticated
            checkForCloudKeys();
        }
    });

    async function checkForCloudKeys() {
        if (!currentUser) {
            console.log('No current user, showing intro');
            setupStep = 'intro';
            return;
        }

        console.log('Checking for cloud encryption keys for user:', currentUser.id);
        
        try {
            const hasCloudKeys = await e2eEncryptionService.hasCloudEncryptionKeys(currentUser.id);
            console.log('Cloud keys check result:', hasCloudKeys);
            
            if (hasCloudKeys) {
                console.log('Found cloud keys, showing existing flow');
                setupStep = 'existing';
            } else {
                console.log('No cloud keys found, showing intro');
                setupStep = 'intro';
            }
        } catch (error) {
            console.error('Failed to check cloud keys:', error);
            // If we can't check cloud keys, assume they might exist and show existing flow
            // This is safer because it prevents accidentally creating new keys
            console.log('Error checking cloud keys - defaulting to existing flow to be safe');
            setupStep = 'existing';
        }
    }

    function handleClose() {
        onclose?.();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            handleClose();
        }
    }

    function validatePassword(): boolean {
        error = '';
        
        if (password.length < 8) {
            error = 'Password must be at least 8 characters long';
            return false;
        }
        
        if (setupStep === 'confirm' && password !== confirmPassword) {
            error = 'Passwords do not match';
            return false;
        }
        
        return true;
    }

    function nextStep() {
        if (setupStep === 'intro') {
            setupStep = 'password';
        } else if (setupStep === 'password') {
            if (validatePassword()) {
                setupStep = 'confirm';
            }
        } else if (setupStep === 'confirm') {
            if (validatePassword()) {
                generateKeys();
            }
        }
    }

    function previousStep() {
        if (setupStep === 'confirm') {
            setupStep = 'password';
            confirmPassword = '';
        } else if (setupStep === 'password') {
            setupStep = 'intro';
            password = '';
            confirmPassword = '';
        }
        error = '';
    }

    async function generateKeys() {
        if (!currentUser) {
            error = 'You must be signed in to set up encryption';
            return;
        }

        isLoading = true;
        setupStep = 'generating';
        error = '';

        try {
            // Generate new encryption keys
            const keyPair = e2eEncryptionService.generateUserKeys();
            
            // Complete signup with the generated keys
            const success = e2eEncryptionService.completeSignup(
                currentUser.id,
                keyPair,
                password
            );

            if (success) {
                setupStep = 'success';
                setTimeout(async () => {
                    onSetupComplete?.();
                    
                    // Trigger post-encryption sync to import any cloud entries
                    try {
                        const { storageService } = await import('../services/storage');
                        await storageService.syncAfterLogin();
                    } catch (error) {
                        console.error('Post-encryption sync failed:', error);
                    }
                    
                    handleClose();
                }, 2000);
            } else {
                error = 'Failed to set up encryption. Please try again.';
                setupStep = 'confirm';
            }
        } catch (err) {
            console.error('Key generation failed:', err);
            error = 'Failed to generate encryption keys. Please try again.';
            setupStep = 'confirm';
        } finally {
            isLoading = false;
        }
    }

    async function unlockExisting() {
        if (!password) {
            error = 'Please enter your encryption password';
            return;
        }

        isLoading = true;
        error = '';

        try {
            let success = false;
            
            // First try to restore keys from cloud
            if (currentUser) {
                try {
                    success = await e2eEncryptionService.restoreKeysFromCloud(currentUser.id, password);
                    if (success) {
                        console.log('Successfully restored encryption keys from cloud');
                    }
                } catch (error) {
                    console.log('Cloud restoration failed, trying local login:', error);
                }
            }
            
            // If cloud restoration failed, try local login
            if (!success) {
                success = e2eEncryptionService.login(password);
            }
            
            if (success) {
                setupStep = 'success';
                setTimeout(async () => {
                    onSetupComplete?.();
                    
                    // Trigger post-encryption sync to import any cloud entries
                    try {
                        const { storageService } = await import('../services/storage');
                        await storageService.syncAfterLogin();
                    } catch (error) {
                        console.error('Post-encryption sync failed:', error);
                    }
                    
                    handleClose();
                }, 1000);
            } else {
                error = 'Invalid password. Please try again.';
            }
        } catch (err) {
            console.error('Unlock failed:', err);
            error = 'Failed to unlock encryption. Please try again.';
        } finally {
            isLoading = false;
        }
    }

    async function resetEncryption() {
        if (confirm('This will delete your current encryption keys and all encrypted data in the cloud. This action cannot be undone. Are you sure?')) {
            e2eEncryptionService.clearStoredKeys();
            setupStep = 'intro';
            password = '';
            confirmPassword = '';
            error = '';
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
    class="setup-overlay"
    onclick={handleClose}
    role="presentation"
>
    <div 
        class="setup-modal"
        onclick={(e: Event) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        tabindex="-1"
    >
        <div class="setup-header">
            <h2 class="setup-title">
                {#if setupStep === 'intro'}
                    Set Up End-to-End Encryption
                {:else if setupStep === 'existing'}
                    Unlock Encryption
                {:else if setupStep === 'password'}
                    Create Encryption Password
                {:else if setupStep === 'confirm'}
                    Confirm Password
                {:else if setupStep === 'generating'}
                    Generating Keys...
                {:else if setupStep === 'success'}
                    Encryption Ready!
                {/if}
            </h2>
            <button class="close-btn" onclick={handleClose} aria-label="Close setup">
                ✕
            </button>
        </div>

        <div class="setup-content">
            {#if setupStep === 'intro'}
                <div class="step-content">
                    <div class="encryption-icon">🔐</div>
                    <h3>Secure Your Journal</h3>
                    <p class="description">
                        End-to-end encryption ensures that only you can read your journal entries, 
                        even when they're stored in the cloud. Your data is encrypted on your device 
                        before being sent to our servers.
                    </p>
                    
                    <div class="features">
                        <div class="feature">
                            <span class="feature-icon">🔒</span>
                            <div>
                                <strong>Private & Secure</strong>
                                <p>Your entries are encrypted with a key only you know</p>
                            </div>
                        </div>
                        <div class="feature">
                            <span class="feature-icon">☁️</span>
                            <div>
                                <strong>Cloud Sync</strong>
                                <p>Access your encrypted entries on all your devices</p>
                            </div>
                        </div>
                        <div class="feature">
                            <span class="feature-icon">🛡️</span>
                            <div>
                                <strong>Zero Knowledge</strong>
                                <p>We can't read your data, even if we wanted to</p>
                            </div>
                        </div>
                    </div>

                    <div class="step-actions">
                        <button class="btn btn-primary" onclick={nextStep}>
                            Get Started
                        </button>
                        <button class="btn btn-secondary" onclick={handleClose}>
                            Maybe Later
                        </button>
                    </div>
                </div>

            {:else if setupStep === 'existing'}
                <div class="step-content">
                    <div class="encryption-icon">🔓</div>
                    <h3>Welcome Back</h3>
                    <p class="description">
                        You already have encryption set up. Enter your password to unlock 
                        your encrypted journal entries.
                    </p>

                    <div class="password-field">
                        <label for="unlock-password">Encryption Password</label>
                        <input
                            id="unlock-password"
                            type="password"
                            bind:value={password}
                            placeholder="Enter your encryption password"
                            disabled={isLoading}
                            autocomplete="current-password"
                        />
                    </div>

                    {#if error}
                        <div class="error-message">{error}</div>
                    {/if}

                    <div class="step-actions">
                        <button 
                            class="btn btn-primary" 
                            onclick={unlockExisting}
                            disabled={!password || isLoading}
                        >
                            {isLoading ? 'Unlocking...' : 'Unlock'}
                        </button>
                        <button class="btn btn-secondary" onclick={handleClose}>
                            Cancel
                        </button>
                    </div>

                    <div class="reset-section">
                        <button class="btn btn-danger-text" onclick={resetEncryption}>
                            Reset Encryption Keys
                        </button>
                        <p class="reset-warning">
                            Only do this if you've forgotten your password. This will delete all encrypted data.
                        </p>
                    </div>
                </div>

            {:else if setupStep === 'password'}
                <div class="step-content">
                    <div class="encryption-icon">🔑</div>
                    <h3>Create a Strong Password</h3>
                    <p class="description">
                        This password will encrypt your journal entries. Choose something 
                        strong and memorable - if you lose it, your encrypted data cannot be recovered.
                    </p>

                    <div class="password-field">
                        <label for="new-password">Encryption Password</label>
                        <input
                            id="new-password"
                            type="password"
                            bind:value={password}
                            placeholder="Enter a strong password (8+ characters)"
                            disabled={isLoading}
                            autocomplete="new-password"
                        />
                    </div>

                    <div class="password-tips">
                        <h4>Password Tips:</h4>
                        <ul>
                            <li>Use at least 8 characters</li>
                            <li>Mix letters, numbers, and symbols</li>
                            <li>Don't use personal information</li>
                            <li>Consider using a passphrase</li>
                        </ul>
                    </div>

                    {#if error}
                        <div class="error-message">{error}</div>
                    {/if}

                    <div class="step-actions">
                        <button 
                            class="btn btn-primary" 
                            onclick={nextStep}
                            disabled={!password || isLoading}
                        >
                            Continue
                        </button>
                        <button class="btn btn-secondary" onclick={previousStep}>
                            Back
                        </button>
                    </div>
                </div>

            {:else if setupStep === 'confirm'}
                <div class="step-content">
                    <div class="encryption-icon">✅</div>
                    <h3>Confirm Your Password</h3>
                    <p class="description">
                        Please re-enter your password to confirm it's correct. 
                        Remember: this password cannot be changed or recovered.
                    </p>

                    <div class="password-field">
                        <label for="confirm-password">Confirm Password</label>
                        <input
                            id="confirm-password"
                            type="password"
                            bind:value={confirmPassword}
                            placeholder="Re-enter your password"
                            disabled={isLoading}
                            autocomplete="new-password"
                        />
                    </div>

                    <div class="warning-box">
                        <strong>⚠️ Important:</strong>
                        Make sure you remember this password. If you lose it, 
                        your encrypted journal entries cannot be recovered.
                    </div>

                    {#if error}
                        <div class="error-message">{error}</div>
                    {/if}

                    <div class="step-actions">
                        <button 
                            class="btn btn-primary" 
                            onclick={nextStep}
                            disabled={!confirmPassword || isLoading}
                        >
                            Set Up Encryption
                        </button>
                        <button class="btn btn-secondary" onclick={previousStep}>
                            Back
                        </button>
                    </div>
                </div>

            {:else if setupStep === 'generating'}
                <div class="step-content">
                    <div class="encryption-icon spinning">⚙️</div>
                    <h3>Setting Up Encryption...</h3>
                    <p class="description">
                        We're generating your encryption keys and setting up secure storage. 
                        This may take a few moments.
                    </p>
                    
                    <div class="progress-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>

            {:else if setupStep === 'success'}
                <div class="step-content">
                    <div class="encryption-icon">🎉</div>
                    <h3>Encryption is Ready!</h3>
                    <p class="description">
                        Your journal is now protected with end-to-end encryption. 
                        You can start writing secure entries and they'll sync across all your devices.
                    </p>

                    <div class="success-features">
                        <div class="feature">
                            <span class="feature-icon success">✅</span>
                            <span>Encryption keys generated</span>
                        </div>
                        <div class="feature">
                            <span class="feature-icon success">✅</span>
                            <span>Secure cloud sync enabled</span>
                        </div>
                        <div class="feature">
                            <span class="feature-icon success">✅</span>
                            <span>Ready to write private entries</span>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .setup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1100;
        backdrop-filter: blur(4px);
    }

    .setup-modal {
        background: var(--color-surface, white);
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        border: 1px solid var(--color-border, #e5e7eb);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .setup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        background: var(--color-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
        color: white;
    }

    .setup-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
    }

    .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 6px;
        transition: background-color 0.2s ease;
        line-height: 1;
    }

    .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .setup-content {
        padding: 2rem;
        flex: 1;
        overflow-y: auto;
    }

    .step-content {
        text-align: center;
    }

    .encryption-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
        display: block;
    }

    .encryption-icon.spinning {
        animation: spin 2s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .step-content h3 {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text, #1f2937);
        margin: 0 0 1rem 0;
    }

    .description {
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.95rem;
        line-height: 1.5;
        margin: 0 0 2rem 0;
        text-align: left;
    }

    .features {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin: 2rem 0;
        text-align: left;
    }

    .feature {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1rem;
        background: var(--color-background, #f8fafc);
        border-radius: 8px;
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .feature-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
    }

    .feature-icon.success {
        color: #059669;
    }

    .feature div {
        flex: 1;
    }

    .feature strong {
        display: block;
        font-weight: 600;
        color: var(--color-text, #1f2937);
        margin-bottom: 0.25rem;
    }

    .feature p {
        margin: 0;
        font-size: 0.875rem;
        color: var(--color-textSecondary, #6b7280);
    }

    .password-field {
        margin: 1.5rem 0;
        text-align: left;
    }

    .password-field label {
        display: block;
        font-weight: 500;
        color: var(--color-text, #1f2937);
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
    }

    .password-field input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 6px;
        background: var(--color-surface, white);
        color: var(--color-text, #1f2937);
        font-size: 1rem;
        transition: border-color 0.2s ease;
    }

    .password-field input:focus {
        outline: none;
        border-color: var(--color-primary, #3b82f6);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .password-field input:disabled {
        background: var(--color-background, #f8fafc);
        cursor: not-allowed;
    }

    .password-tips {
        text-align: left;
        margin: 1.5rem 0;
        padding: 1rem;
        background: var(--color-background, #f8fafc);
        border-radius: 8px;
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .password-tips h4 {
        margin: 0 0 0.75rem 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text, #1f2937);
    }

    .password-tips ul {
        margin: 0;
        padding-left: 1.25rem;
        font-size: 0.875rem;
        color: var(--color-textSecondary, #6b7280);
    }

    .password-tips li {
        margin-bottom: 0.25rem;
    }

    .warning-box {
        text-align: left;
        margin: 1.5rem 0;
        padding: 1rem;
        background: #fef3cd;
        border: 1px solid #f59e0b;
        border-radius: 8px;
        color: #92400e;
        font-size: 0.875rem;
        line-height: 1.5;
    }

    .error-message {
        color: #dc2626;
        font-size: 0.875rem;
        margin: 1rem 0;
        padding: 0.75rem;
        background: #fee2e2;
        border: 1px solid #fecaca;
        border-radius: 6px;
        text-align: left;
    }

    .step-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        margin-top: 2rem;
    }

    .btn {
        padding: 0.75rem 1.5rem;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        min-width: 100px;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-primary {
        background: var(--color-primary, #3b82f6);
        color: white;
    }

    .btn-primary:hover:not(:disabled) {
        background: var(--color-primaryDark, #2563eb);
    }

    .btn-secondary {
        background: var(--color-surface, white);
        color: var(--color-text, #1f2937);
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .btn-secondary:hover:not(:disabled) {
        background: var(--color-background, #f8fafc);
    }

    .btn-danger-text {
        background: none;
        color: #dc2626;
        font-size: 0.75rem;
        text-decoration: underline;
        padding: 0.5rem;
    }

    .btn-danger-text:hover {
        color: #b91c1c;
    }

    .reset-section {
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
        text-align: center;
    }

    .reset-warning {
        font-size: 0.75rem;
        color: var(--color-textSecondary, #6b7280);
        margin: 0.5rem 0 0 0;
        line-height: 1.4;
    }

    .progress-dots {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        margin: 2rem 0;
    }

    .progress-dots span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-primary, #3b82f6);
        animation: pulse 1.5s ease-in-out infinite;
    }

    .progress-dots span:nth-child(2) {
        animation-delay: 0.5s;
    }

    .progress-dots span:nth-child(3) {
        animation-delay: 1s;
    }

    @keyframes pulse {
        0%, 80%, 100% {
            opacity: 0.3;
            transform: scale(1);
        }
        40% {
            opacity: 1;
            transform: scale(1.2);
        }
    }

    .success-features {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin: 2rem 0;
        text-align: left;
    }

    .success-features .feature {
        background: #dcfce7;
        border-color: #bbf7d0;
        align-items: center;
    }

    @media (max-width: 640px) {
        .setup-modal {
            width: 95%;
            margin: 1rem;
            max-height: calc(100vh - 2rem);
        }

        .setup-content {
            padding: 1.5rem;
        }

        .step-actions {
            flex-direction: column;
        }

        .btn {
            width: 100%;
        }
    }
</style>