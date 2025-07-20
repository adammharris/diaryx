<script lang="ts">
    import { currentTheme, themes, setTheme, colorMode } from '../stores/theme.js';
    import { whichTauri } from '../utils/tauri.js';
    import { apiAuthService, apiAuthStore } from '../services/api-auth.service.js';
    import { e2eEncryptionService, e2eSessionStore } from '../services/e2e-encryption.service.js';
    import E2ESetup from './E2ESetup.svelte';

    interface Props {
        storageService: any; // The storage service instance
        onclose: () => void;
    }

    let { storageService, onclose }: Props = $props();

    let selectedTheme = $state($currentTheme);
    let platform = $state('');
    let isMobile = $state(false);

    // Auth and E2E state
    let authSession = $derived($apiAuthStore);
    let e2eSession = $derived($e2eSessionStore);
    let isAuthenticated = $derived(!!authSession?.user);
    let isE2EUnlocked = $derived(e2eSession?.isUnlocked || false);
    let hasStoredKeys = $derived(e2eEncryptionService.hasStoredKeys());
    
    // E2E Setup modal state
    let showE2ESetup = $state(false);

    // Initialize detection when component mounts
    $effect(() => {
        platform = whichTauri();
        
        // Mobile detection
        const checkMobile = () => {
            isMobile = window.innerWidth <= 768;
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        return () => {
            window.removeEventListener('resize', checkMobile);
        };
    });

    // Keep selectedTheme in sync with the store
    $effect(() => {
        selectedTheme = $currentTheme;
    });

    function handleThemeChange(themeName: string) {
        selectedTheme = themeName;
        setTheme(themeName);
    }

    function handleClose() {
        onclose?.();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            handleClose();
        }
    }

    // Auth functions

    async function handleSignOut() {
        try {
            await apiAuthService.signOut();
            e2eEncryptionService.logout();
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    }

    async function handleGoogleSignIn() {
        try {
            const session = await apiAuthService.signInWithGoogle();
            console.log('Signed in successfully:', session.user.email);
        } catch (error) {
            console.error('Google sign in failed:', error);
            alert('Sign in failed. Please try again.');
        }
    }

    function showE2ESetupModal() {
        showE2ESetup = true;
    }

    function closeE2ESetupModal() {
        showE2ESetup = false;
    }

    function handleE2ESetupComplete() {
        // Modal will close automatically
        console.log('E2E encryption setup completed successfully');
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
    class="settings-overlay" 
    class:mobile={isMobile}
    onclick={isMobile ? undefined : handleClose}
    role="presentation"
>
    <div 
        class="settings-modal" 
        class:mobile={isMobile}
        onclick={(e: Event) => e.stopPropagation()}
        onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex="-1"
    >
        <div class="settings-header">
            <h2 class="settings-title">Settings</h2>
            <button class="close-btn" class:mobile={isMobile} onclick={handleClose} aria-label="Close settings">
                {#if isMobile}
                    ← Back
                {:else}
                    ✕
                {/if}
            </button>
        </div>

        <div class="settings-content">
            <div class="setting-section">
                <h3 class="section-title">Appearance</h3>
                <p class="section-description">Choose a color theme for the interface</p>

                <div class="theme-grid">
                    {#each Object.entries(themes) as [key, theme] (key)}
                        <button
                            class="theme-option"
                            class:selected={selectedTheme === key}
                            onclick={() => handleThemeChange(key)}
                        >
                            <div 
                                class="theme-preview" 
                                style="background: {($colorMode === 'light' ? theme.lightColors.gradient : theme.darkColors.gradient)}"
                            ></div>
                            <div class="theme-colors">
                                <div 
                                    class="color-dot" 
                                    style="background-color: {($colorMode === 'light' ? theme.lightColors.primary : theme.darkColors.primary)}"
                                ></div>
                                <div 
                                    class="color-dot" 
                                    style="background-color: {($colorMode === 'light' ? theme.lightColors.accent : theme.darkColors.accent)}"
                                ></div>
                                <div 
                                    class="color-dot" 
                                    style="background-color: {($colorMode === 'light' ? theme.lightColors.surface : theme.darkColors.surface)}"
                                ></div>
                            </div>
                            <span class="theme-name">{theme.name}</span>
                        </button>
                    {/each}
                </div>
            </div>

            <div class="setting-section">
                <h3 class="section-title">Account & Sync</h3>
                <p class="section-description">Manage your account and enable cloud sync with end-to-end encryption</p>

                {#if !isAuthenticated}
                    <div class="auth-section">
                        <p class="auth-description">
                            Sign in to sync your entries across devices with end-to-end encryption.
                            Your data is encrypted client-side and only you can decrypt it.
                        </p>
                        <div class="auth-buttons">
                            <button class="btn btn-primary" onclick={handleGoogleSignIn}>
                                <svg width="18" height="18" viewBox="0 0 24 24" style="margin-right: 0.5rem;">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                </svg>
                                Sign in with Google
                            </button>
                        </div>
                    </div>
                {:else}
                    <div class="user-section">
                        <div class="user-info">
                            <div class="user-avatar">
                                {#if authSession?.user.avatar}
                                    <img src={authSession.user.avatar} alt="Profile" />
                                {:else}
                                    <div class="avatar-fallback">
                                        {authSession?.user.name?.[0] || authSession?.user.email?.[0] || 'U'}
                                    </div>
                                {/if}
                            </div>
                            <div class="user-details">
                                <h4 class="user-name">{authSession?.user.name || 'Anonymous User'}</h4>
                                <p class="user-email">{authSession?.user.email}</p>
                                <p class="user-provider">via {authSession?.user.provider || 'Unknown'}</p>
                            </div>
                        </div>

                        <div class="encryption-status">
                            <div class="status-row">
                                <span class="status-label">Encryption Status:</span>
                                <span class="status-badge" class:unlocked={isE2EUnlocked} class:setup-needed={!hasStoredKeys}>
                                    {#if !hasStoredKeys}
                                        ⚠️ Not Set Up
                                    {:else if isE2EUnlocked}
                                        🔓 Unlocked
                                    {:else}
                                        🔒 Locked
                                    {/if}
                                </span>
                            </div>
                            
                            {#if !hasStoredKeys}
                                <div class="setup-prompt">
                                    <p class="setup-description">
                                        Set up end-to-end encryption to securely sync your entries to the cloud.
                                    </p>
                                    <button class="btn btn-primary btn-small" onclick={showE2ESetupModal}>
                                        Set Up Encryption
                                    </button>
                                </div>
                            {:else if !isE2EUnlocked}
                                <div class="unlock-prompt">
                                    <p class="unlock-description">
                                        Your encryption is set up but locked. Unlock it to publish entries.
                                    </p>
                                    <button class="btn btn-secondary btn-small" onclick={showE2ESetupModal}>
                                        Unlock Encryption
                                    </button>
                                </div>
                            {:else}
                                <div class="encryption-ready">
                                    <p class="ready-description">
                                        🎉 Ready to publish encrypted entries to the cloud!
                                    </p>
                                </div>
                            {/if}
                        </div>

                        {#if isE2EUnlocked}
                            <div class="sync-info">
                                <p class="sync-description">
                                    ✅ Cloud sync enabled<br>
                                    🔐 End-to-end encrypted<br>
                                    📱 Available on all your devices
                                </p>
                            </div>
                        {/if}

                        <button class="btn btn-danger" onclick={handleSignOut}>
                            Sign Out
                        </button>
                    </div>
                {/if}
            </div>

            <div class="setting-section">
                <h3 class="section-title">About</h3>
                <p class="about-text">
                    Diaryx - Personal Journal<br>
                    A beautiful journaling app built with Tauri and Svelte.<br>
                    <br>
                    <strong>Mode:</strong>
                    {#if platform === 'web'}
                        Web Browser
                    {:else if platform === 'android'}
                        Mobile — Android
                    {:else if platform === 'ios'}
                        Mobile — iOS
                    {:else if platform}
                        Desktop — {platform}
                    {:else}
                        Unknown
                    {/if}<br>
                    <strong>Storage:</strong> {platform === 'web' ? 'IndexedDB Only' : 'Files + IndexedDB Cache'}<br>
                    {#if platform !== 'web'}
                        <strong>Location:</strong> {storageService.getJournalPath()}<br>
                    {:else}
                        <em>Note: In web mode, entries are stored locally in your browser's database.</em>
                    {/if}
                </p>
            </div>
        </div>
    </div>
</div>

{#if showE2ESetup}
    <E2ESetup 
        onclose={closeE2ESetupModal}
        onSetupComplete={handleE2ESetupComplete}
    />
{/if}


<style>
    .settings-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
    }

    .settings-modal {
        background: var(--color-surface, white);
        border-radius: 12px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        border: 1px solid var(--color-border, #e5e7eb);
        display: flex;
        flex-direction: column;
    }

    .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        background: var(--color-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
        color: white;
        border-radius: 12px 12px 0 0;
    }

    .settings-title {
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
        touch-action: manipulation;
    }

    @media (hover: hover) {
        .close-btn:hover {
            background: rgba(255, 255, 255, 0.1);
        }
    }

    .settings-content {
        padding: 1.5rem;
        flex: 1;
        overflow-y: auto;
    }

    .setting-section {
        margin-bottom: 2rem;
    }

    .setting-section:last-child {
        margin-bottom: 0;
    }

    .section-title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text, #1f2937);
        margin: 0 0 0.5rem 0;
    }

    .section-description {
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.875rem;
        margin: 0 0 1rem 0;
    }

    .theme-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
    }

    .theme-option {
        background: var(--color-surface, white);
        border: 2px solid var(--color-border, #e5e7eb);
        border-radius: 8px;
        padding: 1rem;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
    }

    @media (hover: hover) {
        .theme-option:hover {
            border-color: var(--color-primary, #3b82f6);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
    }

    .theme-option.selected {
        border-color: var(--color-primary, #3b82f6);
        background: var(--color-background, #f8fafc);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .theme-preview {
        width: 100%;
        height: 40px;
        border-radius: 6px;
        margin-bottom: 0.25rem;
    }

    .theme-colors {
        display: flex;
        gap: 0.25rem;
    }

    .color-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .theme-name {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text, #1f2937);
        text-align: center;
    }

    .about-text {
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0;
    }

    /* Mobile-specific styles */
    .settings-overlay.mobile {
        align-items: flex-start;
        justify-content: flex-start;
        background: none;
        backdrop-filter: none;
    }

    .settings-modal.mobile {
        width: 100%;
        max-width: none;
        height: 100vh;
        max-height: none;
        border-radius: 0;
        border: none;
        box-shadow: none;
        overflow-y: auto;
    }

    .close-btn.mobile {
        padding: 0.75rem 1rem;
        font-size: 0.875rem;
        background: none;
        border: none;
        color: white; /* Changed to white for better visibility */
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.2s ease;
    }

    @media (hover: hover) {
        .close-btn.mobile:hover {
            background: white; /* Make box white on hover */
            color: black; /* Make text black on hover */
        }
    }

    /* Mobile safe area adjustments */
    .settings-modal.mobile .settings-header {
        padding-top: calc(1.5rem + env(safe-area-inset-top));
        padding-left: calc(1.5rem + env(safe-area-inset-left));
        padding-right: calc(1.5rem + env(safe-area-inset-right));
        border-radius: 0;
    }

    .settings-modal.mobile .settings-content {
        padding-left: calc(1.5rem + env(safe-area-inset-left));
        padding-right: calc(1.5rem + env(safe-area-inset-right));
        padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
    }

    @media (max-width: 640px) {
        .settings-modal:not(.mobile) {
            width: 95%;
            margin: 1rem;
        }

        .theme-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    /* Auth Section Styles */
    .auth-section, .user-section {
        background: var(--color-background, #f8fafc);
        border-radius: 8px;
        padding: 1.5rem;
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .auth-description {
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0 0 1rem 0;
    }

    .auth-buttons {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .btn {
        padding: 0.5rem 1rem;
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
        min-height: 36px;
    }

    .btn-primary {
        background: var(--color-primary, #3b82f6);
        color: white;
    }

    .btn-primary:hover {
        background: var(--color-primaryDark, #2563eb);
    }

    .btn-secondary {
        background: var(--color-surface, white);
        color: var(--color-text, #1f2937);
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .btn-secondary:hover {
        background: var(--color-background, #f8fafc);
    }

    .btn-danger {
        background: #dc2626;
        color: white;
    }

    .btn-danger:hover {
        background: #b91c1c;
    }

    .btn-small {
        padding: 0.375rem 0.75rem;
        font-size: 0.75rem;
    }

    .user-info {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .user-avatar {
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid var(--color-border, #e5e7eb);
    }

    .user-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .avatar-fallback {
        width: 100%;
        height: 100%;
        background: var(--color-primary, #3b82f6);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 1.25rem;
    }

    .user-details {
        flex: 1;
    }

    .user-name {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text, #1f2937);
        margin: 0 0 0.25rem 0;
    }

    .user-email {
        font-size: 0.875rem;
        color: var(--color-textSecondary, #6b7280);
        margin: 0 0 0.25rem 0;
    }

    .user-provider {
        font-size: 0.75rem;
        color: var(--color-textSecondary, #6b7280);
        margin: 0;
    }

    .encryption-status {
        margin-bottom: 1.5rem;
        padding: 1rem;
        background: var(--color-surface, white);
        border-radius: 6px;
        border: 1px solid var(--color-border, #e5e7eb);
    }

    .status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.5rem;
    }

    .status-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text, #1f2937);
    }

    .status-badge {
        font-size: 0.75rem;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #fee2e2;
        color: #dc2626;
        border: 1px solid #fecaca;
    }

    .status-badge.unlocked {
        background: #dcfce7;
        color: #166534;
        border-color: #bbf7d0;
    }

    .status-badge.setup-needed {
        background: #fef3cd;
        color: #92400e;
        border-color: #fde68a;
    }

    .sync-info {
        margin-bottom: 1.5rem;
    }

    .sync-description {
        color: var(--color-textSecondary, #6b7280);
        font-size: 0.875rem;
        line-height: 1.5;
        margin: 0;
    }

    .setup-prompt, .unlock-prompt, .encryption-ready {
        margin-top: 0.75rem;
    }

    .setup-description, .unlock-description, .ready-description {
        font-size: 0.875rem;
        color: var(--color-textSecondary, #6b7280);
        margin: 0 0 0.75rem 0;
        line-height: 1.4;
    }

    .ready-description {
        color: #166534;
        font-weight: 500;
    }
</style>
