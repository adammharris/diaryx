# Modal System Guide

This document explains how to use the consolidated modal system in Diaryx.

## Overview

The `modals.css` file provides a comprehensive, reusable modal framework that consolidates all modal patterns from the existing Svelte components. It supports:

- Multiple modal types (dialog, settings, auth, setup, info)
- Responsive design with mobile optimizations
- CSS custom property theming integration
- Accessibility features
- Backdrop/overlay click handling
- Safe area insets for mobile devices

## Basic Usage

### 1. Import the CSS

```typescript
// In your component or main CSS file
import '../styles/modals.css';
```

### 2. Basic Modal Structure

```svelte
{#if isVisible}
  <div class="modal-overlay" onclick={handleBackdropClick}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2 class="modal-title">Modal Title</h2>
        <button class="close-btn" onclick={handleClose}>✕</button>
      </div>
      
      <div class="modal-body">
        <!-- Modal content goes here -->
      </div>
      
      <div class="modal-footer">
        <div class="footer-buttons">
          <button class="btn btn-primary">Confirm</button>
          <button class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  </div>
{/if}
```

## Modal Types

### Dialog Modal (Simple confirmations, alerts)

```svelte
<div class="dialog-overlay">
  <div class="dialog-content">
    <div class="dialog-header">
      <h3 class="dialog-title">
        <span class="dialog-icon">❓</span>
        Confirm Action
      </h3>
      <button class="close-btn">✕</button>
    </div>
    <div class="dialog-body">
      <p class="dialog-message">Are you sure you want to continue?</p>
    </div>
    <div class="dialog-footer">
      <button class="btn btn-secondary">Cancel</button>
      <button class="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

### Settings Modal (With gradient header)

```svelte
<div class="settings-overlay">
  <div class="settings-modal">
    <div class="settings-header">
      <h2 class="settings-title">Settings</h2>
      <button class="close-btn">✕</button>
    </div>
    <div class="settings-content">
      <!-- Settings content -->
    </div>
  </div>
</div>
```

### Auth Modal (Authentication flows)

```svelte
<div class="auth-modal-backdrop">
  <div class="auth-modal">
    <div class="auth-modal-header">
      <h2>Sign In</h2>
      <button class="close-btn">×</button>
    </div>
    <div class="auth-modal-content">
      <!-- Auth form content -->
    </div>
  </div>
</div>
```

### Setup Modal (Multi-step processes)

```svelte
<div class="setup-overlay">
  <div class="setup-modal">
    <div class="setup-header">
      <h2 class="setup-title">Setup Process</h2>
      <button class="close-btn">✕</button>
    </div>
    <div class="setup-content">
      <!-- Setup steps content -->
    </div>
  </div>
</div>
```

## Features

### Mobile Responsive

The modal system automatically adapts to mobile devices:

- Full-screen modals on mobile
- Safe area inset support for iOS devices
- Touch-friendly button sizes
- Optimized scrolling

### Mobile-Specific Modals

For full mobile experience, add the `mobile` class:

```svelte
<div class="settings-overlay mobile">
  <div class="settings-modal mobile">
    <!-- Modal content -->
  </div>
</div>
```

### Backdrop Click Handling

```typescript
function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    handleClose();
  }
}
```

### Keyboard Navigation

```typescript
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    handleClose();
  }
}
```

### Message Types

The system includes predefined styles for different message types:

```svelte
<!-- Error message -->
<div class="error-message">Something went wrong!</div>

<!-- Success message -->
<div class="modal-success">Operation completed successfully!</div>

<!-- Warning message -->
<div class="warning-box">
  <strong>⚠️ Important:</strong> This action cannot be undone.
</div>

<!-- Info message -->
<div class="modal-info">Additional information about this feature.</div>
```

### Loading States

```svelte
<div class="modal-loading">
  <div class="modal-spinner"></div>
  <span>Loading...</span>
</div>
```

### Form Elements

```svelte
<div class="form-group">
  <label for="email">Email</label>
  <input 
    id="email" 
    type="email" 
    placeholder="Enter your email"
    bind:value={email}
  />
</div>
```

## Theming Integration

The modal system uses CSS custom properties that integrate with the Diaryx theme system:

- `--color-surface` - Modal background
- `--color-background` - Header/footer background
- `--color-text` - Primary text color
- `--color-textSecondary` - Secondary text color
- `--color-border` - Border color
- `--color-primary` - Primary accent color
- `--color-gradient` - Gradient for special headers

## Accessibility

The modal system includes:

- Proper ARIA attributes (`role="dialog"`, `aria-modal="true"`)
- Focus management
- Keyboard navigation support
- High contrast mode support
- Reduced motion support

## Animation Support

Optional animations can be enabled by adding the `animate-in` class:

```svelte
<div class="modal-overlay animate-in">
  <div class="modal-content animate-in">
    <!-- Modal content -->
  </div>
</div>
```

## Utility Classes

- `.modal-hidden` - Hide modal completely
- `.modal-full-width` - Full width modal
- `.modal-compact` - Reduced padding
- `.modal-no-padding` - No padding in body
- `.modal-scrollable` - Scrollable body with max height

## Migration Guide

To migrate existing modals to use this system:

1. Replace custom modal CSS classes with standardized ones:
   - `.modal-backdrop` → `.modal-overlay`
   - Custom header/body/footer classes → `.modal-header`, `.modal-body`, `.modal-footer`

2. Update class names to use consistent naming:
   - Various close button classes → `.close-btn`
   - Various title classes → `.modal-title`

3. Remove duplicate CSS from component files

4. Use the standardized message classes for error/success/warning states

5. Leverage the mobile-responsive features instead of custom mobile styles

## Examples from Existing Components

The consolidated system replaces modal patterns from:

- `Dialog.svelte` - Simple dialog modals
- `InfoModal.svelte` - Information display modals  
- `Settings.svelte` - Settings configuration modal
- `AuthModal.svelte` - Authentication modals
- `E2ESetup.svelte` - Multi-step setup modals

Each of these can now use the standardized modal classes while maintaining their unique content and behavior.