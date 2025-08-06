/**
 * Tauri Environment Detection Utilities
 * 
 * Provides reliable detection of Tauri runtime environment across different
 * build configurations and deployment scenarios.
 * 
 * @description This module helps distinguish between Tauri desktop applications
 * and web browser environments. It uses multiple detection methods for reliability
 * including global object detection, user agent checking, and protocol inspection.
 * 
 * The detection is crucial for:
 * - Conditional API usage (Tauri plugins vs browser APIs)
 * - Platform-specific UI adaptations
 * - Feature availability checks
 * - Build-time optimizations
 * 
 * @example
 * ```typescript
 * import { detectTauri, whichTauri } from '$lib/utils/tauri';
 * 
 * if (detectTauri()) {
 *   // Use Tauri-specific APIs
 *   const platform = whichTauri();
 *   console.log('Running on Tauri:', platform);
 * } else {
 *   // Use browser APIs
 *   console.log('Running in web browser');
 * }
 * ```
 */
import { platform } from '@tauri-apps/plugin-os';

/**
 * Detects if the app is running in Tauri environment
 * 
 * Uses multiple detection methods for maximum reliability across different
 * Tauri versions and build configurations.
 * 
 * @returns {boolean} True if running in Tauri environment
 * 
 * @example
 * ```typescript
 * if (detectTauri()) {
 *   // Safe to use Tauri APIs
 *   const { invoke } = await import('@tauri-apps/api/core');
 *   await invoke('my_command');
 * } else {
 *   // Use web-compatible alternatives
 *   fetch('/api/data');
 * }
 * ```
 */
export function detectTauri(): boolean {
    // During SSR/build time, return false
    if (typeof window === 'undefined') {
        return false;
    }

    const checks = {
        hasTauriGlobal: !!(window as any).__TAURI__,
        hasTauriInternals: !!(window as any).__TAURI_INTERNALS__,
        hasTauriInvoke: !!(window as any).__TAURI_INVOKE__,
        userAgent: typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri'),
        protocol: typeof location !== 'undefined' && location.protocol === 'tauri:',
        // Additional check for Tauri's invoke function
        hasInvokeMethod: typeof (window as any).__TAURI_INVOKE__ === 'function'
    };

    const isTauri = Object.values(checks).some(Boolean);

    return isTauri;
}

/**
 * Reactive Tauri detection for component initialization
 * 
 * Provides immediate detection with retry logic for cases where Tauri globals
 * may not be immediately available during component mounting.
 * 
 * @returns {boolean} True if Tauri environment is detected
 * 
 * @example
 * ```typescript
 * // In a Svelte component's onMount or constructor
 * const isTauri = createTauriDetector();
 * 
 * if (isTauri) {
 *   // Initialize Tauri-specific features
 *   await setupTauriFeatures();
 * }
 * ```
 */
export function createTauriDetector() {
    let isTauri = false;
    
    // Initial detection
    if (typeof window !== 'undefined') {
        isTauri = detectTauri();
        
        // Retry detection after a short delay if not detected initially
        // This handles cases where Tauri globals load after the component
        if (!isTauri) {
            setTimeout(() => {
                isTauri = detectTauri();
            }, 100);
        }
    }
    
    return isTauri;
}

/**
 * Get the current platform information
 * 
 * Returns the platform name when running in Tauri, or 'web' when running
 * in a browser environment.
 * 
 * @returns {string} Platform name ('windows', 'macos', 'linux', 'android', 'ios') or 'web'
 * 
 * @example
 * ```typescript
 * const platform = whichTauri();
 * 
 * switch (platform) {
 *   case 'windows':
 *     // Windows-specific handling
 *     break;
 *   case 'macos':
 *     // macOS-specific handling
 *     break;
 *   case 'web':
 *     // Browser-specific handling
 *     break;
 *   default:
 *     // Other platforms (linux, android, ios)
 * }
 * ```
 */
export function whichTauri(): string {
    if (detectTauri()) {
        return platform();
    }
    return 'web';
}