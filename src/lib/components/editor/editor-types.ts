import type { JournalEntry } from '../../storage/types';

/**
 * Props for the main Editor component
 */
export interface EditorProps {
    storageService: any;
    entryId: string | null;
    preloadedEntry?: JournalEntry | null;
    onclose?: () => void;
    onsaved?: (data: { id: string; content: string }) => void;
    onrenamed?: (data: { oldId: string; newId: string }) => void;
    onpublishtoggle?: (data: { entryId: string; publish: boolean; tagIds?: string[] }) => void;
    onerror?: (data: { title: string; message: string }) => void;
    onkeyboardtoggle?: (data: { visible: boolean }) => void;
}

/**
 * Save status types for the editor
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Props for EditorHeader component
 */
export interface EditorHeaderProps {
    entry: JournalEntry | null;
    editableTitle: string;
    isEditingTitle: boolean;
    isEntryLocked: boolean;
    canPublish: boolean;
    isPublished: boolean;
    isMobile: boolean;
    onTitleEdit: () => void;
    onTitleSave: () => void;
    onTitleCancel: () => void;
    onTitleKeydown: (event: KeyboardEvent) => void;
    onClose: () => void;
    onTogglePublish: () => void;
    onShowInfo: () => void;
    onTogglePreview: () => void;
    isPreview: boolean;
}

/**
 * Props for EditorContent component
 */
export interface EditorContentProps {
    content: string;
    isPreview: boolean;
    isLoading: boolean;
    isEntryLocked: boolean;
    isMobile: boolean;
    textareaFocused: boolean;
    onContentChange: (content: string) => void;
    onTextareaFocus: () => void;
    onTextareaBlur: () => void;
    onTextareaInput: () => void;
    onTextareaClick: () => void;
    onUnlockEntry: () => void;
    textareaElement?: HTMLTextAreaElement | null;
}

/**
 * Props for EditorFooter component
 */
export interface EditorFooterProps {
    entry: JournalEntry | null;
    content: string;
    saveStatus: SaveStatus;
    canPublish: boolean;
    isPublished: boolean;
    isEntryLocked: boolean;
    isMobile: boolean;
    isKeyboardVisible: boolean;
    keyboardHeight: number;
}

/**
 * Props for PublishModal component
 */
export interface PublishModalProps {
    isVisible: boolean;
    entry: JournalEntry | null;
    entryId?: string | null;
    selectedTagIds: string[];
    frontmatterTags: string[];
    onTagSelectionChange: (tagIds: string[]) => void;
    onPublishWithTags: () => void;
    onCancel: () => void;
}

/**
 * Keyboard and mobile utilities
 */
export interface MobileUtils {
    scrollToCursor: (textareaElement: HTMLTextAreaElement, content: string) => void;
    detectMobile: () => boolean;
}