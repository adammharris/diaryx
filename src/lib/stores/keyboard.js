import { readable } from 'svelte/store';
import { whichTauri } from '$lib/utils/tauri';

/**
 * A readable Svelte store that tracks if the on-screen keyboard is visible.
 * It uses the modern `VirtualKeyboard` API where available (Chrome on Android),
 * Tauri virtual keyboard plugin for iOS Tauri apps, and falls back to a 
 * `visualViewport` resize heuristic for others (iOS Safari web).
 */
export const isKeyboardVisible = readable(false, (set) => {
  const currentPlatform = whichTauri();
  let initialHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  if (currentPlatform === 'web' || currentPlatform === 'android') {
      // --- Modern API: For Chrome on Android ---
    if ('virtualKeyboard' in navigator) {
      // Enable virtual keyboard to overlay content (required for API to work properly)
      navigator.virtualKeyboard.overlaysContent = true;
      
      // The new API is event-based and reliable
      const onGeometryChange = (event) => {
        // The keyboard is visible if its height is greater than 0
        const rect = event.target.boundingRect;
        const isVisible = rect.height > 0;
        set(isVisible);
        
        // Also update the global keyboard height for layout calculations
        if (window.virtualKeyboardHeight !== rect.height) {
          window.virtualKeyboardHeight = rect.height;
        }
      };

      navigator.virtualKeyboard.addEventListener('geometrychange', onGeometryChange);
      
      // Fallback: Also listen to visualViewport as backup in case VirtualKeyboard events don't fire
      if (window.visualViewport) {
        const onViewportResize = () => {
          const newHeight = window.visualViewport.height;
          const isProbablyOpen = initialHeight - newHeight > 150; // Lower threshold for Android
          // Only use this if VirtualKeyboard doesn't seem to be working
          if (!navigator.virtualKeyboard.boundingRect || navigator.virtualKeyboard.boundingRect.height === 0) {
            set(isProbablyOpen);
          }
        };
        
        window.visualViewport.addEventListener('resize', onViewportResize);
        
        return () => {
          navigator.virtualKeyboard.removeEventListener('geometrychange', onGeometryChange);
          window.visualViewport.removeEventListener('resize', onViewportResize);
        };
      }
      
      return () => navigator.virtualKeyboard.removeEventListener('geometrychange', onGeometryChange);
    } else {
      // --- Fallback Heuristic: For iOS Safari and other browsers ---
      if (window.visualViewport) {
        const onResize = () => {
          const newHeight = window.visualViewport.height;
          // If the viewport height shrinks by a significant amount (e.g., >200px),
          // it's very likely the keyboard has appeared.
          const isProbablyOpen = initialHeight - newHeight > 200;
          set(isProbablyOpen);
        };

        // We also reset the initial height on focus/blur of inputs
        // to handle cases where the keyboard is already open on page load.
        const onFocus = (e) => {
            if (e.target.matches('input, textarea')) {
                initialHeight = window.visualViewport.height;
            }
        }

        window.visualViewport.addEventListener('resize', onResize);
        document.body.addEventListener('focusin', onFocus);

        return () => {
          window.visualViewport.removeEventListener('resize', onResize);
          document.body.removeEventListener('focusin', onFocus);
        };
      }
    }
  } else if (currentPlatform === 'ios') {
    // --- Tauri Plugin: For iOS Tauri apps ---
    const onKeyboardWillShow = (event) => {
      console.log('Tauri keyboard will show:', event.detail);
      set(true);
    };

    const onKeyboardWillHide = () => {
      console.log('Tauri keyboard will hide');
      set(false);
    };

    window.addEventListener('keyboardWillShow', onKeyboardWillShow);
    window.addEventListener('keyboardWillHide', onKeyboardWillHide);

    return () => {
      window.removeEventListener('keyboardWillShow', onKeyboardWillShow);
      window.removeEventListener('keyboardWillHide', onKeyboardWillHide);
    };
  }

  // If no method is available, the store will just remain `false`.
  return () => {};
});

/**
 * A readable Svelte store that tracks the keyboard height when visible.
 * This is primarily used for iOS Tauri apps with the virtual keyboard plugin.
 */
export const keyboardHeight = readable(0, (set) => {
  const currentPlatform = whichTauri();
  
  if (currentPlatform === 'ios') {
    // --- Tauri Plugin: For iOS Tauri apps ---
    const onKeyboardWillShow = (event) => {
      const height = event.detail?.height || 0;
      const duration = event.detail?.duration || 0.25;
      
      // Store the animation duration globally for CSS transitions
      document.documentElement.style.setProperty('--keyboard-animation-duration', `${duration}s`);
      
      set(height);
    };

    const onKeyboardWillHide = () => {;
      set(0);
    };

    window.addEventListener('keyboardWillShow', onKeyboardWillShow);
    window.addEventListener('keyboardWillHide', onKeyboardWillHide);

    return () => {
      window.removeEventListener('keyboardWillShow', onKeyboardWillShow);
      window.removeEventListener('keyboardWillHide', onKeyboardWillHide);
    };
  }

  // For other platforms, keyboard height isn't available
  return () => {};
});