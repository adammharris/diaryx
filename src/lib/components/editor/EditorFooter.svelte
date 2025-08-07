<script lang="ts">
    import type { EditorFooterProps } from './editor-types';
    import { apiAuthService } from '../../services/api-auth.service.js';

    let { 
        entry, 
        content, 
        saveStatus, 
        canPublish, 
        isPublished, 
        isEntryLocked, 
        isMobile, 
        isKeyboardVisible, 
        keyboardHeight 
    }: EditorFooterProps = $props();

    // Calculate word count
    let wordCount = $derived.by(() => {
        return content.split(/\s+/).filter(w => w.length > 0).length;
    });

    // Format last modified time
    let lastModified = $derived.by(() => {
        if (!entry) return '';
        return new Date(entry.modified_at).toLocaleString();
    });

    // Determine status display
    let statusInfo = $derived.by(() => {
        if (isEntryLocked) {
            return {
                icon: '/material-symbols--lock.svg',
                text: 'Locked',
                alt: 'Locked'
            };
        }
        
        if (canPublish) {
            if (isPublished) {
                return {
                    icon: '/material-symbols--public.svg',
                    text: 'Published',
                    alt: 'Published'
                };
            } else {
                return {
                    icon: '/material-symbols--draft.svg',
                    text: 'Draft',
                    alt: 'Draft'
                };
            }
        }
        
        if (apiAuthService.isAuthenticated()) {
            return {
                icon: '/material-symbols--lock.svg',
                text: 'Encryption locked',
                alt: 'Encryption locked'
            };
        }
        
        return {
            icon: '/material-symbols--edit-note.svg',
            text: 'Local only',
            alt: 'Local only'
        };
    });

    // Dynamic padding for mobile keyboard
    let footerStyle = $derived.by(() => {
        if (isMobile && isKeyboardVisible && keyboardHeight > 0) {
            return 'padding-bottom: 0.5rem;';
        }
        return 'padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));';
    });

    let footerClass = $derived.by(() => {
        let classes = 'editor-footer';
        if (isMobile && isKeyboardVisible && keyboardHeight > 0) {
            classes += ' keyboard-animating';
        }
        return classes;
    });
</script>

<div 
    class={footerClass}
    style={footerStyle}
>
    <span class="status-section">
        <img src={statusInfo.icon} class="status-icon" alt={statusInfo.alt} />
        {statusInfo.text}
    </span>
    
    <span class="word-count">
        {wordCount} words
    </span>
    
    {#if entry}
        <span class="last-modified">
            Last modified: {lastModified}
        </span>
    {/if}
    
    <span class="autosave-status">
        {#if saveStatus === 'saving'}
            <span class="saving">Saving...</span>
        {:else if saveStatus === 'saved'}
            <span class="saved">Saved</span>
        {:else if saveStatus === 'error'}
            <span class="error">Save Error!</span>
        {/if}
    </span>
</div>

<style>
    .editor-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 1.5rem;
        border-top: 1px solid var(--color-border);
        background: var(--color-background);
        font-size: 0.875rem;
        color: var(--color-textSecondary);
        gap: 1rem;
        flex-wrap: wrap;
    }

    .status-section {
        display: flex;
        align-items: center;
        gap: 0.375rem;
    }

    .status-icon {
        width: 12px;
        height: 12px;
        filter: var(--color-icon-filter);
        flex-shrink: 0;
    }

    .word-count {
        font-weight: 500;
    }

    .last-modified {
        color: var(--color-textSecondary);
        font-size: 0.8125rem;
    }

    .autosave-status {
        font-weight: 500;
    }

    .saving {
        color: var(--color-textSecondary);
    }

    .saved {
        color: var(--color-success, #22c55e);
    }

    .error {
        color: var(--color-error, #ef4444);
    }

    /* Mobile keyboard animation */
    .keyboard-animating {
        transition: padding-bottom var(--keyboard-animation-duration, 0.25s) cubic-bezier(0.36, 0.66, 0.04, 1);
    }

    /* Mobile responsive adjustments */
    @media (max-width: 768px) {
        .editor-footer {
            padding: 0.5rem 1rem;
            padding-left: calc(1rem + env(safe-area-inset-left));
            padding-right: calc(1rem + env(safe-area-inset-right));
            font-size: 0.8125rem;
            gap: 0.75rem;
        }

        .last-modified {
            display: none; /* Hide on very small screens to save space */
        }
    }

    /* Very small screens */
    @media (max-width: 480px) {
        .editor-footer {
            flex-wrap: wrap;
            justify-content: center;
            text-align: center;
            gap: 0.5rem;
        }

        .status-section, 
        .word-count, 
        .autosave-status {
            flex: 1;
            min-width: max-content;
        }
    }
</style>