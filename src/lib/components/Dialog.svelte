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
    class="modal-overlay" 
    onclick={handleCancel}
    onkeydown={(e) => e.key === 'Escape' && handleCancel()}
    role="presentation"
  >
    <div 
      class="modal-content modal-small" 
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      tabindex="-1"
    >
      <div class="modal-header">
        <h3 class="flex items-center gap-2 text-lg font-semibold" id="dialog-title">
          <span class="text-base">{icon()}</span>
          {title}
        </h3>
        <button class="close-btn" onclick={handleCancel} aria-label="Close">✕</button>
      </div>

      <div class="modal-body">
        <p class="leading-relaxed">{message}</p>
      </div>

      <div class="modal-footer">
        {#if showCancel}
          <button 
            class="btn btn-secondary" 
            onclick={handleCancel}
          >
            {cancelText}
          </button>
        {/if}
        <button 
          class="btn {type === 'error' ? 'btn-danger' : 'btn-primary'}" 
          onclick={handleConfirm}
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Component-specific styles - Dialog uses extracted modal and button styles */
</style>