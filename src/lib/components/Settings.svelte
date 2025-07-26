<script lang="ts">
    import { currentTheme, themes, setTheme, colorMode } from '../stores/theme.js';
    import { whichTauri } from '../utils/tauri.js';
    import { apiAuthService, apiAuthStore } from '../services/api-auth.service.js';
    import { e2eEncryptionService, e2eSessionStore } from '../services/e2e-encryption.service.js';
    import E2ESetup from './E2ESetup.svelte';
    import TagManager from './TagManager.svelte';
    import BiometricSetup from './BiometricSetup.svelte';

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
    
    // Tag Manager modal state
    let showTagManager = $state(false);
    
    // Biometric Setup modal state
    let showBiometricSetup = $state(false);
    let biometricAvailable = $state(false);
    let biometricEnabled = $state(false);

    // Initialize detection when component mounts
    $effect(() => {
        platform = whichTauri();
        
        // Mobile detection
        const checkMobile = () => {
            isMobile = window.innerWidth <= 768;
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        // Check biometric status
        checkBiometricStatus();
        
        return () => {
            window.removeEventListener('resize', checkMobile);
        };
    });

    async function checkBiometricStatus() {
        try {
            biometricAvailable = await e2eEncryptionService.isBiometricAvailable();
            biometricEnabled = e2eEncryptionService.isBiometricEnabled();
        } catch (error) {
            console.error('Failed to check biometric status:', error);
        }
    }

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

    // Tag Manager functions
    function showTagManagerModal() {
        showTagManager = true;
    }

    function closeTagManagerModal() {
        showTagManager = false;
    }

    // Biometric Setup functions
    function closeBiometricSetupModal() {
        showBiometricSetup = false;
        // Refresh biometric status after potential changes
        checkBiometricStatus();
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
    class="modal-overlay"
    onclick={isMobile ? undefined : handleClose}
    role="presentation"
>
    <div 
        class="modal-content settings-modal"
        class:mobile={isMobile}
        onclick={(e: Event) => e.stopPropagation()}
        onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex="-1"
    >
        <div class="modal-header">
            <h2 style="color: var(--text-color);">Settings</h2>
            <button class="close-btn" onclick={handleClose} aria-label="Close settings">
                {#if isMobile}
                    ← Back
                {:else}
                    ✕
                {/if}
            </button>
        </div>

        <div class="modal-body">
            <div class="form-section">
                <h3>Appearance</h3>
                <p>Choose a color theme for the interface</p>

                <div class="grid grid-cols-4 gap-4 mobile:grid-cols-2">
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

            <div class="form-section">
                <h3>Account & Sync</h3>
                <p>Manage your account and enable cloud sync with end-to-end encryption</p>

                {#if !isAuthenticated}
                    <div class="mb-4">
                        <p class="text-secondary mb-4">
                            Sign in to sync your entries across devices with end-to-end encryption.
                            Your data is encrypted client-side and only you can decrypt it.
                        </p>
                        <div class="flex gap-2">
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
                    <div class="bg-surface p-4 rounded-lg">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-12 h-12 rounded-full overflow-hidden bg-accent flex items-center justify-center">
                                {#if authSession?.user.avatar}
                                    <img src={authSession.user.avatar} alt="Profile" class="w-full h-full object-cover" />
                                {:else}
                                    <div class="text-lg font-semibold text-white">
                                        {authSession?.user.name?.[0] || authSession?.user.email?.[0] || 'U'}
                                    </div>
                                {/if}
                            </div>
                            <div class="flex-1">
                                <h4 class="font-semibold text-base">{authSession?.user.name || 'Anonymous User'}</h4>
                                <p class="text-secondary text-sm">{authSession?.user.email}</p>
                                <p class="text-secondary text-xs">via {authSession?.user.provider || 'Unknown'}</p>
                            </div>
                        </div>

                        <div class="bg-background p-3 rounded border mb-4">
                            <div class="flex justify-between items-center mb-2">
                                <span class="font-medium">Encryption Status:</span>
                                <span class="px-2 py-1 rounded text-sm font-medium" class:bg-success={isE2EUnlocked} class:bg-warning={!hasStoredKeys} class:text-white={isE2EUnlocked || !hasStoredKeys}>
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
                                <div class="mt-3">
                                    <p class="text-secondary text-sm mb-3">
                                        Set up end-to-end encryption to securely sync your entries to the cloud.
                                    </p>
                                    <button class="btn btn-primary btn-small" onclick={showE2ESetupModal}>
                                        Set Up Encryption
                                    </button>
                                </div>
                            {:else if !isE2EUnlocked}
                                <div class="mt-3">
                                    <p class="text-secondary text-sm mb-3">
                                        Your encryption is set up but locked. Unlock it to publish entries.
                                    </p>
                                    <button class="btn btn-secondary btn-small" onclick={showE2ESetupModal}>
                                        Unlock Encryption
                                    </button>
                                </div>
                            {:else}
                                <div class="mt-3">
                                    <p class="text-success text-sm">
                                        🎉 Ready to publish encrypted entries to the cloud!
                                    </p>
                                </div>
                            {/if}
                        </div>

                        {#if isE2EUnlocked}
                            <div class="bg-success bg-opacity-10 p-3 rounded text-sm">
                                <p class="text-success leading-relaxed">
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

            <!-- Biometric Authentication Section -->
            {#if isAuthenticated && hasStoredKeys}
                <div class="form-section">
                    <h3>Biometric Authentication</h3>
                    <p>Use your device's biometric authentication to automatically unlock encryption</p>

                    <div class="bg-surface p-4 rounded-lg">
                        <div class="flex justify-between items-center mb-3">
                            <div>
                                <span class="font-medium">Device Support:</span>
                                <span class="ml-2 px-2 py-1 rounded text-sm font-medium" class:bg-success={biometricAvailable} class:bg-warning={!biometricAvailable} class:text-white={biometricAvailable || !biometricAvailable}>
                                    {#if biometricAvailable}
                                        ✅ Available
                                    {:else}
                                        ❌ Not Available
                                    {/if}
                                </span>
                            </div>
                        </div>

                        <div class="flex justify-between items-center mb-3">
                            <div>
                                <span class="font-medium">Biometric Unlock:</span>
                                <span class="ml-2 px-2 py-1 rounded text-sm font-medium" class:bg-success={biometricEnabled} class:bg-gray-200={!biometricEnabled} class:text-white={biometricEnabled} class:text-gray-600={!biometricEnabled}>
                                    {#if biometricEnabled}
                                        🔓 Enabled
                                    {:else}
                                        🔒 Disabled
                                    {/if}
                                </span>
                            </div>
                        </div>

                        {#if biometricAvailable}
                            <div class="mt-3">
                                {#if !biometricEnabled}
                                    <p class="text-secondary text-sm mb-3">
                                        Enable biometric authentication to automatically unlock your encryption password using fingerprint, face recognition, or other biometric methods.
                                    </p>
                                    <button class="btn btn-primary btn-small" onclick={() => showBiometricSetup = true}>
                                        Enable Biometric Authentication
                                    </button>
                                {:else}
                                    <p class="text-success text-sm mb-3">
                                        🎉 Biometric authentication is enabled! You can unlock encryption without entering your password.
                                    </p>
                                    <button class="btn btn-secondary btn-small" onclick={() => showBiometricSetup = true}>
                                        Manage Biometric Settings
                                    </button>
                                {/if}
                            </div>
                        {:else}
                            <div class="mt-3">
                                <p class="text-secondary text-sm">
                                    Biometric authentication is not available on this device. Make sure your device has biometric hardware and it's enabled in your device settings.
                                </p>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- Tag Management Section -->
            {#if isAuthenticated && isE2EUnlocked}
                <div class="form-section">
                    <h3>Sharing & Tags</h3>
                    <p>Manage tags to share encrypted entries with specific users</p>

                    <div class="tag-management-section">
                        <div class="bg-surface p-4 rounded-lg">
                            <div class="flex justify-between items-center mb-4">
                                <div>
                                    <h4 class="font-semibold text-base mb-1">Tag-Based Sharing</h4>
                                    <p class="text-secondary text-sm">
                                        Create tags and assign them to users to share encrypted entries securely.
                                        Each shared entry is encrypted separately for each user.
                                    </p>
                                </div>
                            </div>

                            <div class="flex gap-3">
                                <button class="btn btn-primary" onclick={showTagManagerModal}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.5rem;">
                                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                                        <line x1="7" y1="7" x2="7.01" y2="7"/>
                                    </svg>
                                    Manage Tags
                                </button>
                                
                                <div class="flex items-center gap-2 text-sm text-secondary">
                                    <span class="inline-flex items-center gap-1">
                                        🔐 End-to-end encrypted
                                    </span>
                                    <span>•</span>
                                    <span class="inline-flex items-center gap-1">
                                        🔗 Shareable with tags
                                    </span>
                                </div>
                            </div>

                            <div class="mt-4 p-3 bg-info bg-opacity-10 rounded border-l-4 border-info">
                                <p class="text-info text-sm leading-relaxed">
                                    <strong>How it works:</strong><br>
                                    1. Create tags and assign them to users<br>
                                    2. When publishing entries, select which tags can access them<br>
                                    3. Users with those tags can decrypt and read your shared entries
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <div class="form-section">
                <h3>About</h3>
                <p class="text-secondary text-sm leading-relaxed">
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

{#if showTagManager}
    <TagManager 
        onclose={closeTagManagerModal}
    />
{/if}

{#if showBiometricSetup}
    <BiometricSetup 
        onclose={closeBiometricSetupModal}
    />
{/if}


<style>
    /* Component-specific styles - theme preview elements */
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
        color: var(--color-text);
        text-align: center;
    }
</style>
