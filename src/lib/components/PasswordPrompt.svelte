<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { estimatePasswordStrength } from '../utils/crypto.js';

    interface Props {
        entryTitle: string;
        lastAttemptFailed?: boolean;
        isVisible: boolean;
    }

    let { entryTitle, lastAttemptFailed = false, isVisible }: Props = $props();

    const dispatch = createEventDispatcher<{
        submit: { password: string };
        cancel: {};
    }>();

    let password = $state('');
    let showPassword = $state(false);
    let isSubmitting = $state(false);

    // Reset state when modal becomes visible
    $effect(() => {
        if (isVisible) {
            password = '';
            showPassword = false;
            isSubmitting = false;
            // Focus the password input after a short delay to ensure it's rendered
            setTimeout(() => {
                const input = document.querySelector('.password-input') as HTMLInputElement;
                input?.focus();
            }, 100);
        }
    });

    let passwordStrength = $derived(password ? estimatePasswordStrength(password) : null);

    function handleSubmit() {
        if (!password.trim() || isSubmitting) return;
        
        isSubmitting = true;
        dispatch('submit', { password: password.trim() });
        
        // Reset submitting state after a delay to prevent multiple submissions
        setTimeout(() => {
            isSubmitting = false;
        }, 1000);
    }

    function handleCancel() {
        dispatch('cancel', {});
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleSubmit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            handleCancel();
        }
    }

    function togglePasswordVisibility() {
        showPassword = !showPassword;
    }
</script>

{#if isVisible}
    <div 
        class="modal-overlay" 
        onclick={handleCancel}
        onkeydown={(e) => e.key === 'Escape' && handleCancel()}
        role="presentation"
    >
        <div 
            class="modal-content" 
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-modal-title"
            tabindex="-1"
        >
            <div class="modal-header">
                <h3 class="modal-title" id="password-modal-title">🔒 Enter Password</h3>
                <button class="close-btn" onclick={handleCancel} aria-label="Close">✕</button>
            </div>

            <div class="modal-body">
                <p class="entry-info">
                    Enter the password to decrypt <strong>"{entryTitle}"</strong>
                </p>

                {#if lastAttemptFailed}
                    <div class="error-message">
                        ❌ Incorrect password. Please try again.
                    </div>
                {/if}

                <div class="password-field">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        bind:value={password}
                        onkeydown={handleKeydown}
                        placeholder="Enter password..."
                        class="password-input"
                        disabled={isSubmitting}
                    />
                    <button
                        class="toggle-password-btn"
                        onclick={togglePasswordVisibility}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        type="button"
                    >
                        {#if showPassword}
                            <svg class="icon" viewBox="0 0 16 16">
                                <path d="M10.79 12.912l-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7.029 7.029 0 0 0 2.79-.588zM5.21 3.088A7.028 7.028 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474L5.21 3.089z"/>
                                <path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829l-2.83-2.829zm4.95.708l-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6l-12-12 .708-.708 12 12-.708.708z"/>
                            </svg>
                        {:else}
                            <svg class="icon" viewBox="0 0 16 16">
                                <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                                <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
                            </svg>
                        {/if}
                    </button>
                </div>

                {#if password && passwordStrength}
                    <div class="password-strength strength-{passwordStrength}">
                        Password strength: <span class="strength-label">{passwordStrength}</span>
                    </div>
                {/if}
            </div>

            <div class="modal-footer">
                <button 
                    class="btn btn-secondary" 
                    onclick={handleCancel}
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button 
                    class="btn btn-primary" 
                    onclick={handleSubmit}
                    disabled={!password.trim() || isSubmitting}
                >
                    {isSubmitting ? 'Decrypting...' : 'Decrypt'}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
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

    .modal-content {
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        width: 90%;
        max-width: 400px;
        max-height: 90vh;
        overflow: hidden;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border-bottom: 1px solid #e5e7eb;
        background: #f9fafb;
    }

    .modal-title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: #1f2937;
    }

    .close-btn {
        background: none;
        border: none;
        color: #6b7280;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.2s ease;
    }

    .close-btn:hover {
        background: #f3f4f6;
        color: #374151;
    }

    .modal-body {
        padding: 1.5rem;
    }

    .entry-info {
        margin: 0 0 1rem 0;
        color: #374151;
        line-height: 1.5;
    }

    .error-message {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #dc2626;
        padding: 0.75rem;
        border-radius: 6px;
        margin-bottom: 1rem;
        font-size: 0.875rem;
    }

    .password-field {
        position: relative;
        margin-bottom: 1rem;
    }

    .password-input {
        width: 100%;
        padding: 0.75rem 3rem 0.75rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.875rem;
        outline: none;
        transition: border-color 0.2s ease;
        box-sizing: border-box;
    }

    .password-input:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .password-input:disabled {
        background: #f9fafb;
        color: #9ca3af;
        cursor: not-allowed;
    }

    .toggle-password-btn {
        position: absolute;
        right: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 4px;
        transition: all 0.2s ease;
    }

    .toggle-password-btn:hover {
        background: #f3f4f6;
        color: #374151;
    }

    .toggle-password-btn .icon {
        width: 16px;
        height: 16px;
        fill: currentColor;
    }

    .password-strength {
        font-size: 0.75rem;
        margin-top: 0.5rem;
        padding: 0.5rem;
        border-radius: 4px;
        transition: all 0.2s ease;
    }

    .password-strength.strength-weak {
        background: #fef2f2;
        color: #dc2626;
        border: 1px solid #fecaca;
    }

    .password-strength.strength-medium {
        background: #fffbeb;
        color: #d97706;
        border: 1px solid #fed7aa;
    }

    .password-strength.strength-strong {
        background: #f0fdf4;
        color: #15803d;
        border: 1px solid #bbf7d0;
    }

    .strength-label {
        font-weight: 600;
        text-transform: capitalize;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        padding: 1.5rem;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
    }

    .btn {
        padding: 0.75rem 1.5rem;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid transparent;
        outline: none;
    }

    .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: white;
        color: #374151;
        border-color: #d1d5db;
    }

    .btn-secondary:hover:not(:disabled) {
        background: #f9fafb;
        border-color: #9ca3af;
    }

    .btn-primary {
        background: #3b82f6;
        color: white;
        border-color: #3b82f6;
    }

    .btn-primary:hover:not(:disabled) {
        background: #2563eb;
        border-color: #2563eb;
    }

    .btn-primary:focus {
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
</style>