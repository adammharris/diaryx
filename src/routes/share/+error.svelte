<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';

    let status = $derived($page.status);
    let error = $derived($page.error);

    function handleGoHome() {
        goto('/');
    }
</script>

<svelte:head>
    <title>Error - Diaryx</title>
</svelte:head>

<div class="error-page">
    <div class="error-content">
        <div class="error-icon">😞</div>
        <h1>Oops! Something went wrong</h1>
        
        {#if status === 404}
            <h2>Shared Entry Not Found</h2>
            <p>The shared entry you're looking for doesn't exist or is no longer available.</p>
        {:else if status >= 500}
            <h2>Server Error</h2>
            <p>We're experiencing some technical difficulties. Please try again later.</p>
        {:else}
            <h2>Error {status}</h2>
            <p>{error?.message || 'An unexpected error occurred.'}</p>
        {/if}

        <div class="error-actions">
            <button class="btn btn-primary" onclick={handleGoHome}>
                Go to Diaryx App
            </button>
            <button class="btn btn-secondary" onclick={() => window.location.reload()}>
                Try Again
            </button>
        </div>

        <div class="help-text">
            <p>
                If you believe this is an error, please check that you have the complete shareable link, 
                including the encryption key after the # symbol.
            </p>
        </div>
    </div>
</div>

<style>
    .error-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        background: var(--color-background, #f8fafc);
    }

    .error-content {
        text-align: center;
        max-width: 500px;
        background: var(--color-surface, #ffffff);
        padding: 3rem 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    }

    .error-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
    }

    h1 {
        margin: 0 0 1rem 0;
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--color-text, #1f2937);
    }

    h2 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text, #1f2937);
    }

    p {
        margin: 0 0 1.5rem 0;
        color: var(--color-textSecondary, #6b7280);
        line-height: 1.5;
    }

    .error-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        margin: 2rem 0;
    }

    .help-text {
        margin-top: 2rem;
        padding-top: 2rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
    }

    .help-text p {
        font-size: 0.875rem;
        margin: 0;
    }

    @media (max-width: 768px) {
        .error-content {
            padding: 2rem 1rem;
        }

        .error-actions {
            flex-direction: column;
            align-items: center;
        }

        h1 {
            font-size: 1.5rem;
        }
    }
</style>