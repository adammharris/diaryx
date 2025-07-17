// Utility for detecting Tauri environment consistently across the app
import { platform } from '@tauri-apps/plugin-os';
/**
 * Detects if the app is running in Tauri environment
 * Uses multiple detection methods for reliability
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
 * Reactive Tauri detection that can be used in Svelte components
 * Returns a readable store that updates when the environment is detected
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

export function whichTauri(): string {
    if (detectTauri()) {
        return platform();
    }
    return 'web';
}