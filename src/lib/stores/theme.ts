import { writable } from 'svelte/store';

export interface Theme {
    name: string;
    colors: {
        primary: string;
        primaryHover: string;
        secondary: string;
        background: string;
        surface: string;
        text: string;
        textSecondary: string;
        border: string;
        accent: string;
        gradient: string;
    };
}

export const themes: Record<string, Theme> = {
    default: {
        name: 'Ocean Blue',
        colors: {
            primary: '#3b82f6',
            primaryHover: '#2563eb',
            secondary: '#6b7280',
            background: '#f8fafc',
            surface: '#ffffff',
            text: '#1f2937',
            textSecondary: '#6b7280',
            border: '#e5e7eb',
            accent: '#10b981',
            gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }
    },
    forest: {
        name: 'Forest Green',
        colors: {
            primary: '#059669',
            primaryHover: '#047857',
            secondary: '#6b7280',
            background: '#f0fdf4',
            surface: '#ffffff',
            text: '#064e3b',
            textSecondary: '#6b7280',
            border: '#dcfce7',
            accent: '#f59e0b',
            gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        }
    },
    sunset: {
        name: 'Sunset Orange',
        colors: {
            primary: '#ea580c',
            primaryHover: '#c2410c',
            secondary: '#6b7280',
            background: '#fff7ed',
            surface: '#ffffff',
            text: '#9a3412',
            textSecondary: '#6b7280',
            border: '#fed7aa',
            accent: '#dc2626',
            gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
        }
    },
    purple: {
        name: 'Royal Purple',
        colors: {
            primary: '#7c3aed',
            primaryHover: '#6d28d9',
            secondary: '#6b7280',
            background: '#faf5ff',
            surface: '#ffffff',
            text: '#581c87',
            textSecondary: '#6b7280',
            border: '#e9d5ff',
            accent: '#ec4899',
            gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
        }
    },
    dark: {
        name: 'Dark Mode',
        colors: {
            primary: '#3b82f6',
            primaryHover: '#2563eb',
            secondary: '#9ca3af',
            background: '#111827',
            surface: '#1f2937',
            text: '#f9fafb',
            textSecondary: '#9ca3af',
            border: '#374151',
            accent: '#10b981',
            gradient: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)'
        }
    }
};

// Get saved theme from localStorage or default
function getInitialTheme(): string {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('diaryx-theme') || 'default';
    }
    return 'default';
}

export const currentTheme = writable<string>(getInitialTheme());

// Update CSS variables when theme changes
currentTheme.subscribe((themeName) => {
    if (typeof window !== 'undefined') {
        const theme = themes[themeName];
        if (theme) {
            const root = document.documentElement;
            Object.entries(theme.colors).forEach(([key, value]) => {
                root.style.setProperty(`--color-${key}`, value);
            });
            localStorage.setItem('diaryx-theme', themeName);
        }
    }
});

export function setTheme(themeName: string) {
    if (themes[themeName]) {
        currentTheme.set(themeName);
    }
}
