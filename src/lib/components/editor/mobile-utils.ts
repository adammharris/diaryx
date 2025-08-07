/**
 * Mobile utility functions for the editor
 * Extracted from the main Editor component for reusability
 */

/**
 * Scrolls the textarea to keep the cursor visible when typing on mobile
 * @param textareaElement - The textarea element to scroll
 * @param content - The current content of the textarea
 */
export function scrollToCursor(textareaElement: HTMLTextAreaElement, content: string): void {
    if (!textareaElement || !detectMobile()) return;
    
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
        if (!textareaElement) return;
        
        try {
            const cursorPosition = textareaElement.selectionStart;
            const textBeforeCursor = content.substring(0, cursorPosition);
            const lines = textBeforeCursor.split('\n');
            const currentLine = lines.length - 1;
            
            // Calculate approximate cursor position
            const lineHeight = parseFloat(getComputedStyle(textareaElement).lineHeight) || 24;
            const cursorTop = currentLine * lineHeight;
            
            // Get textarea container dimensions
            const containerRect = textareaElement.getBoundingClientRect();
            const scrollTop = textareaElement.scrollTop;
            const containerHeight = containerRect.height;
            
            // Calculate if cursor is visible
            const relativeTop = cursorTop - scrollTop;
            const margin = lineHeight * 2; // Keep 2 lines margin
            
            if (relativeTop < margin) {
                // Cursor is too close to top, scroll up
                textareaElement.scrollTop = Math.max(0, cursorTop - margin);
            } else if (relativeTop > containerHeight - margin) {
                // Cursor is too close to bottom, scroll down
                textareaElement.scrollTop = cursorTop - containerHeight + margin;
            }
            
            console.log('Scrolled to cursor:', { 
                cursorPosition, 
                currentLine, 
                cursorTop, 
                scrollTop: textareaElement.scrollTop 
            });
        } catch (error) {
            console.warn('Error scrolling to cursor:', error);
        }
    });
}

/**
 * Detects if the current device is mobile
 * @returns true if mobile, false otherwise
 */
export function detectMobile(): boolean {
    return window.innerWidth <= 768;
}

/**
 * Sets up mobile detection with resize listener
 * @param onMobileChange - Callback when mobile state changes
 * @returns cleanup function to remove listeners
 */
export function setupMobileDetection(onMobileChange: (isMobile: boolean) => void): () => void {
    const checkMobile = () => {
        onMobileChange(detectMobile());
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
        window.removeEventListener('resize', checkMobile);
    };
}

/**
 * Handles textarea focus for mobile devices
 * @param isMobile - Whether the device is mobile
 * @param onKeyboardToggle - Callback for keyboard visibility changes
 */
export function handleTextareaFocus(
    isMobile: boolean, 
    isKeyboardVisible: boolean,
    onKeyboardToggle?: (data: { visible: boolean }) => void
): void {
    if (isMobile && isKeyboardVisible) {
        onKeyboardToggle?.({ visible: true });
    }
}

/**
 * Handles textarea blur for mobile devices
 * @param isMobile - Whether the device is mobile
 * @param onKeyboardToggle - Callback for keyboard visibility changes
 */
export function handleTextareaBlur(
    isMobile: boolean,
    onKeyboardToggle?: (data: { visible: boolean }) => void
): void {
    if (isMobile) {
        onKeyboardToggle?.({ visible: false });
    }
}

/**
 * Utility array comparison function
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
}