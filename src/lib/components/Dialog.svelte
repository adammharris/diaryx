<script lang="ts">
  type DialogType = 'info' | 'error' | 'warning' | 'confirm';

  interface Props {
    isVisible: boolean;
    title: string;
    message: string;
    type?: DialogType;
    confirmText?: string;
    cancelText?: string;
    onconfirm?: (() => void) | null;
    oncancel?: (() => void) | null;
    onclose: () => void;
  }

  let { 
    isVisible, 
    title, 
    message, 
    type = 'info',
    confirmText = 'OK',
    cancelText = 'Cancel',
    onconfirm,
    oncancel,
    onclose 
  }: Props = $props();

  // Focus management
  $effect(() => {
    if (isVisible) {
      // Focus the dialog after a short delay to ensure it's rendered
      setTimeout(() => {
        const dialog = document.querySelector('.dialog-content') as HTMLElement;
        dialog?.focus();
      }, 100);
    }
  });

  function handleConfirm() {
    onconfirm?.();
    onclose();
  }

  function handleCancel() {
    oncancel?.();
    onclose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    } else if (event.key === 'Enter' && type !== 'confirm') {
      event.preventDefault();
      handleConfirm();
    }
  }

  // Determine icon based on type
  let icon = $derived(() => {
    switch (type) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'confirm': return '❓';
      default: return 'ℹ️';
    }
  });

  // Show cancel button for confirm dialogs
  let showCancel = $derived(type === 'confirm' || oncancel);
</script>

{#if isVisible}
  <div 
    class="dialog-overlay" 
    onclick={handleCancel}
    onkeydown={(e) => e.key === 'Escape' && handleCancel()}
    role="presentation"
  >
    <div 
      class="dialog-content" 
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      tabindex="-1"
    >
      <div class="dialog-header">
        <h3 class="dialog-title" id="dialog-title">
          <span class="dialog-icon">{icon()}</span>
          {title}
        </h3>
        <button class="close-btn" onclick={handleCancel} aria-label="Close">✕</button>
      </div>

      <div class="dialog-body">
        <p class="dialog-message">{message}</p>
      </div>

      <div class="dialog-footer">
        {#if showCancel}
          <button 
            class="btn btn-secondary" 
            onclick={handleCancel}
          >
            {cancelText}
          </button>
        {/if}
        <button 
          class="btn btn-primary {type === 'error' ? 'btn-danger' : ''}" 
          onclick={handleConfirm}
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
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

  .dialog-content {
    background: var(--color-surface);
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    width: 90%;
    max-width: 400px;
    max-height: 90vh;
    overflow: hidden;
    outline: none;
  }

  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);
  }

  .dialog-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dialog-icon {
    font-size: 1rem;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-textSecondary);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--color-border);
    color: var(--color-text);
  }

  .dialog-body {
    padding: 1.5rem;
  }

  .dialog-message {
    margin: 0;
    color: var(--color-text);
    line-height: 1.5;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.5rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-background);
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
    background: var(--color-surface);
    color: var(--color-text);
    border-color: var(--color-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-background);
    border-color: var(--color-textSecondary);
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primaryHover);
    border-color: var(--color-primaryHover);
  }

  .btn-primary:focus {
    box-shadow: 0 0 0 3px var(--color-primary-shadow);
  }

  .btn-danger {
    background: var(--color-secondary);
    border-color: var(--color-secondary);
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--color-textSecondary);
    border-color: var(--color-textSecondary);
  }

  .btn-danger:focus {
    box-shadow: 0 0 0 3px var(--color-secondary-shadow);
  }
</style>