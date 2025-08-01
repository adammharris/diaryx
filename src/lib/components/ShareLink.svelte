<script lang="ts">
    import type { JournalEntry } from '../storage/types.js';
    import { fetch } from '../utils/fetch.js';
    import { VITE_API_BASE_URL } from '$lib/config/env-validation.js';
    import { storageService } from '../services/storage.js';
    import { e2eEncryptionService } from '../services/e2e-encryption.service.js';
    import { EntryCryptor } from '../crypto/EntryCryptor.js';
    import nacl from 'tweetnacl';

    interface Props {
        entry: JournalEntry | null;
        isVisible: boolean;
        onclose?: () => void;
    }

    let { entry, isVisible, onclose }: Props = $props();

    let shareableLink = $state('');
    let isGenerating = $state(false);
    let copyStatus = $state<'idle' | 'copied' | 'error'>('idle');
    let linkGenerated = $state(false);

    // Generate shareable link by fetching data from backend
    async function generateShareableLink() {
        if (!entry) {
            console.error('No entry available');
            return;
        }

        try {
            isGenerating = true;
            
            // First, check if entry is published and get cloud ID
            const isPublished = await storageService.getEntryPublishStatus(entry.id);
            if (!isPublished) {
                throw new Error('Entry is not published. Please publish the entry first before creating a shareable link.');
            }
            
            // Get the cloud UUID for this local entry
            const cloudId = await storageService.getCloudId(entry.id);
            if (!cloudId) {
                throw new Error('Unable to find cloud ID for this entry. Please try republishing the entry.');
            }
            
            // Fetch the published entry data from the backend using cloud ID
            // This gives us the encryption metadata needed for the shareable link
            const response = await fetch(`${VITE_API_BASE_URL}/entries/public/${cloudId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Entry not found or not published for public sharing');
                } else {
                    throw new Error(`Failed to fetch entry: ${response.statusText}`);
                }
            }

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch entry data');
            }

            const publishedEntry = result.data;
            
            // We need to decrypt the entry key locally and embed the raw key in the shareable link
            // This allows anonymous users to decrypt without needing the original user's private key
            
            // First, let's get the entry key from the published entry's encryption metadata
            // The backend should return the encrypted entry key and nonce
            const encryptedEntryKeyB64 = publishedEntry.encryption_metadata?.encryptedEntryKeyB64;
            const keyNonceB64 = publishedEntry.encryption_metadata?.keyNonceB64;
            const contentNonceB64 = publishedEntry.encryption_metadata?.contentNonceB64;
            
            if (!encryptedEntryKeyB64 || !keyNonceB64 || !contentNonceB64) {
                throw new Error('Missing encryption metadata from published entry');
            }
            
            // Check if we have an active E2E session to decrypt the entry key
            if (!e2eEncryptionService.isUnlocked()) {
                throw new Error('E2E encryption session is not active. Please unlock your account first.');
            }
            
            // We'll decrypt the entry key manually instead of using the E2E service
            // since we need the raw key for the shareable link
            
            const userSession = e2eEncryptionService.getCurrentSession();
            if (!userSession?.userKeyPair?.secretKey) {
                throw new Error('No user secret key available for decryption');
            }
            
            // Decrypt the entry key using our private key and our own public key
            // (Since this is the author's own entry, the key was encrypted for ourselves)
            const ourPublicKeyBytes = userSession.userKeyPair.publicKey;
            const encryptedKeyBytes = new Uint8Array(atob(encryptedEntryKeyB64).split('').map(c => c.charCodeAt(0)));
            const keyNonceBytes = new Uint8Array(atob(keyNonceB64).split('').map(c => c.charCodeAt(0)));
            
            const rawEntryKey = nacl.box.open(encryptedKeyBytes, keyNonceBytes, ourPublicKeyBytes, userSession.userKeyPair.secretKey);
            
            if (!rawEntryKey) {
                throw new Error('Failed to decrypt entry key locally');
            }
            
            // Create share data with the RAW decrypted entry key (not encrypted)
            const keyData = {
                rawEntryKey: btoa(String.fromCharCode(...rawEntryKey)), // Raw key as base64
                contentNonce: contentNonceB64, // Content nonce for decryption
                authorPublicKey: publishedEntry.author_public_key // Author's public key for verification
            };
            
            const shareData = {
                entryId: cloudId,
                keyData: keyData
            };
            
            // Encode the share data as base64url for the query parameter
            const shareDataJson = JSON.stringify(shareData);
            const shareDataBase64 = btoa(shareDataJson)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
            
            // Generate the shareable link using query parameter format for static adapter compatibility
            const baseUrl = window.location.origin;
            shareableLink = `${baseUrl}/share?q=${shareDataBase64}`;
            
            linkGenerated = true;
            console.log('Shareable link generated:', shareableLink);
        } catch (error) {
            console.error('Failed to generate shareable link:', error);
            shareableLink = 'Error generating link';
        } finally {
            isGenerating = false;
        }
    }

    // Copy link to clipboard
    async function copyToClipboard() {
        if (!shareableLink || shareableLink === 'Error generating link') return;

        try {
            await navigator.clipboard.writeText(shareableLink);
            copyStatus = 'copied';
            setTimeout(() => copyStatus = 'idle', 2000);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            copyStatus = 'error';
            setTimeout(() => copyStatus = 'idle', 2000);
        }
    }

    // Reset state when dialog opens/closes
    $effect(() => {
        if (isVisible && entry) {
            linkGenerated = false;
            shareableLink = '';
            copyStatus = 'idle';
        }
    });

    function handleClose() {
        onclose?.();
    }

    function handleBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            handleClose();
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            handleClose();
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isVisible && entry}
    <div class="modal-overlay" onclick={handleBackdropClick}>
        <div class="modal-content">
            <div class="modal-header">
                <div class="entry-header">
                    <h1 class="modal-title">🔗 Share Entry</h1>
                    <div class="entry-info">
                        <h3 class="entry-title">{entry.title}</h3>
                        <div class="entry-meta">
                            <span class="date">{formatDate(entry.modified_at)}</span>
                        </div>
                    </div>
                </div>
                <button 
                    class="close-btn"
                    onclick={handleClose}
                    aria-label="Close share dialog"
                >
                    ×
                </button>
            </div>

            <div class="modal-body">
                <div class="share-content">
                    <div class="share-info">
                        <h4>Create a shareable link</h4>
                        <p class="description">
                            Generate a secure link that allows anyone to view this entry without signing in. 
                            The encryption key is embedded in the link for secure access.
                        </p>
                        
                        <div class="security-note">
                            <div class="warning-icon">⚠️</div>
                            <div class="warning-text">
                                <strong>Security Notice:</strong> Anyone with this link can read the entry content. 
                                Only share with trusted recipients. The link contains the decryption key.
                            </div>
                        </div>
                    </div>

                    {#if !linkGenerated}
                        <div class="generate-section">
                            <button 
                                class="btn btn-primary"
                                onclick={generateShareableLink}
                                disabled={isGenerating}
                            >
                                {isGenerating ? 'Generating Link...' : 'Generate Shareable Link'}
                            </button>
                        </div>
                    {:else}
                        <div class="link-section">
                            <label for="shareable-link" class="link-label">
                                Shareable Link:
                            </label>
                            <div class="link-container">
                                <input
                                    id="shareable-link"
                                    type="text"
                                    value={shareableLink}
                                    readonly
                                    class="link-input"
                                    onclick={(e) => e.target.select()}
                                />
                                <button 
                                    class="copy-btn"
                                    onclick={copyToClipboard}
                                    disabled={copyStatus === 'copied'}
                                    title="Copy to clipboard"
                                >
                                    {#if copyStatus === 'copied'}
                                        ✓
                                    {:else if copyStatus === 'error'}
                                        ✗
                                    {:else}
                                        📋
                                    {/if}
                                </button>
                            </div>
                            
                            {#if copyStatus === 'copied'}
                                <div class="copy-success">
                                    ✅ Link copied to clipboard!
                                </div>
                            {:else if copyStatus === 'error'}
                                <div class="copy-error">
                                    ❌ Failed to copy. Please copy manually.
                                </div>
                            {/if}

                            <div class="link-actions">
                                <button 
                                    class="btn btn-secondary"
                                    onclick={generateShareableLink}
                                    disabled={isGenerating}
                                >
                                    Generate New Link
                                </button>
                                <button 
                                    class="btn btn-secondary"
                                    onclick={handleClose}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    {/if}

                    <div class="share-tips">
                        <h5>Tips for secure sharing:</h5>
                        <ul>
                            <li>Only share links with people you trust</li>
                            <li>The link contains the decryption key - treat it like a password</li>
                            <li>Consider using secure messaging apps for sharing sensitive links</li>
                            <li>Anyone with the link can view the entry content</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

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

    .modal-content {
        background: var(--color-surface);
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        max-width: 600px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        padding: 1.5rem;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        background: var(--color-background);
    }

    .entry-header {
        flex: 1;
    }

    .modal-title {
        margin: 0 0 1rem 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text);
    }

    .entry-info {
        margin-top: 0.5rem;
    }

    .entry-title {
        margin: 0 0 0.5rem 0;
        font-size: 1.125rem;
        font-weight: 500;
        color: var(--color-text);
        opacity: 0.9;
    }

    .entry-meta {
        display: flex;
        gap: 1rem;
        font-size: 0.875rem;
        color: var(--color-textSecondary);
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--color-textSecondary);
        padding: 0.25rem;
        line-height: 1;
        margin-left: 1rem;
        min-width: 24px;
        min-height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s;
    }

    .close-btn:hover {
        background: var(--color-border);
        color: var(--color-text);
    }

    .modal-body {
        padding: 1.5rem;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .share-content {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .share-info h4 {
        margin: 0 0 0.75rem 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text);
    }

    .description {
        margin: 0 0 1rem 0;
        color: var(--color-textSecondary);
        line-height: 1.5;
    }

    .security-note {
        display: flex;
        gap: 0.75rem;
        padding: 1rem;
        background: #fef3cd;
        border: 1px solid #f6e05e;
        border-radius: 6px;
        align-items: flex-start;
    }

    .warning-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
    }

    .warning-text {
        font-size: 0.875rem;
        color: #92400e;
        line-height: 1.4;
    }

    .generate-section {
        text-align: center;
        padding: 2rem 0;
    }

    .link-section {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .link-label {
        font-weight: 500;
        color: var(--color-text);
        margin-bottom: 0.5rem;
        display: block;
    }

    .link-container {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .link-input {
        flex: 1;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: var(--color-background);
        color: var(--color-text);
        font-family: monospace;
        font-size: 0.875rem;
        word-break: break-all;
    }

    .link-input:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px var(--color-primaryShadow);
    }

    .copy-btn {
        background: var(--color-primary);
        color: white;
        border: none;
        padding: 0.75rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1rem;
        transition: background-color 0.2s;
        min-width: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .copy-btn:hover:not(:disabled) {
        background: var(--color-primaryHover);
    }

    .copy-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .copy-success,
    .copy-error {
        font-size: 0.875rem;
        padding: 0.5rem;
        border-radius: 4px;
        text-align: center;
    }

    .copy-success {
        background: #d1fae5;
        color: #065f46;
        border: 1px solid #a7f3d0;
    }

    .copy-error {
        background: #fee2e2;
        color: #991b1b;
        border: 1px solid #fca5a5;
    }

    .link-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        margin-top: 1rem;
    }

    .share-tips {
        background: var(--color-background);
        padding: 1rem;
        border-radius: 6px;
        border: 1px solid var(--color-border);
    }

    .share-tips h5 {
        margin: 0 0 0.75rem 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--color-text);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .share-tips ul {
        margin: 0;
        padding-left: 1.25rem;
        color: var(--color-textSecondary);
        font-size: 0.875rem;
        line-height: 1.5;
    }

    .share-tips li {
        margin-bottom: 0.25rem;
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
        .modal-overlay {
            padding: 0;
        }

        .modal-content {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
        }

        .modal-header {
            padding: 1rem;
            padding-top: calc(1rem + env(safe-area-inset-top));
        }

        .modal-title {
            font-size: 1.25rem;
        }

        .entry-meta {
            flex-direction: column;
            gap: 0.5rem;
        }

        .link-container {
            flex-direction: column;
            gap: 0.75rem;
        }

        .link-input {
            font-size: 0.8rem;
        }

        .copy-btn {
            width: 100%;
        }

        .link-actions {
            flex-direction: column;
        }
    }
</style>