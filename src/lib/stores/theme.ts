import { writable } from 'svelte/store';

export interface ColorPalette {
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
}

export interface Theme {
    name: string;
    lightColors: ColorPalette;
    darkColors: ColorPalette;
}

export const themes: Record<string, Theme> = {
    default: {
        name: 'Ocean Blue',
        lightColors: {
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
        },
        darkColors: {
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
    },
    forest: {
        name: 'Forest Green',
        lightColors: {
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
        },
        darkColors: {
            primary: '#059669',
            primaryHover: '#047857',
            secondary: '#9ca3af',
            background: '#062e21',
            surface: '#0a3d2c',
            text: '#d1fae5',
            textSecondary: '#9ca3af',
            border: '#14532d',
            accent: '#f59e0b',
            gradient: 'linear-gradient(135deg, #065f46 0%, #059669 100%)'
        }
    },
    sunset: {
        name: 'Sunset Orange',
        lightColors: {
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
        },
        darkColors: {
            primary: '#ea580c',
            primaryHover: '#c2410c',
            secondary: '#9ca3af',
            background: '#431407',
            surface: '#5e1c0a',
            text: '#ffedd5',
            textSecondary: '#9ca3af',
            border: '#7c2d12',
            accent: '#dc2626',
            gradient: 'linear-gradient(135deg, #9a3412 0%, #ea580c 100%)'
        }
    },
    purple: {
        name: 'Royal Purple',
        lightColors: {
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
        },
        darkColors: {
            primary: '#7c3aed',
            primaryHover: '#6d28d9',
            secondary: '#9ca3af',
            background: '#2e1065',
            surface: '#3f0f87',
            text: '#f3e8ff',
            textSecondary: '#9ca3af',
            border: '#5b21b6',
            accent: '#ec4899',
            gradient: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)'
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
export const colorMode = writable<'light' | 'dark'>(getInitialColorMode());

function getInitialColorMode(): 'light' | 'dark' {
    if (typeof window !== 'undefined') {
        const savedMode = localStorage.getItem('diaryx-color-mode') as 'light' | 'dark';
        if (savedMode) {
            return savedMode;
        }
        // If no saved mode, check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
    }
    return 'light';
}

// Listen for system color scheme changes
if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        colorMode.set(event.matches ? 'dark' : 'light');
    });
}

// Apply theme and color mode
function applyTheme(themeName: string, mode: 'light' | 'dark') {
    if (typeof window !== 'undefined') {
        const theme = themes[themeName];
        if (theme) {
            const root = document.documentElement;
            const colors = mode === 'light' ? theme.lightColors : theme.darkColors;

            Object.entries(colors).forEach(([key, value]) => {
                root.style.setProperty(`--color-${key}`, value);
            });

            // Update data-theme and data-color-mode attributes on body
            root.setAttribute('data-theme', themeName);
            root.setAttribute('data-color-mode', mode);

            localStorage.setItem('diaryx-theme', themeName);
            localStorage.setItem('diaryx-color-mode', mode);
        }
    }
}

// Subscribe to theme changes
currentTheme.subscribe((themeName) => {
    colorMode.subscribe((mode) => {
        applyTheme(themeName, mode);
    });
});

export function setTheme(themeName: string) {
    if (themes[themeName]) {
        currentTheme.set(themeName);
    }
}

export function setColorMode(mode: 'light' | 'dark') {
    colorMode.set(mode);
}
