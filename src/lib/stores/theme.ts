import { writable } from 'svelte/store';

export interface ColorPalette {
    primary: string;
    primaryHover: string;
    primaryShadow: string;
    secondary: string;
    secondaryShadow: string;
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
            primaryShadow: 'rgba(59, 130, 246, 0.1)',
            secondary: '#6b7280',
            secondaryShadow: 'rgba(107, 114, 128, 0.1)',
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
            primaryShadow: 'rgba(59, 130, 246, 0.2)',
            secondary: '#9ca3af',
            secondaryShadow: 'rgba(156, 163, 175, 0.2)',
            background: '#111827',
            surface: '#1f2937',
            text: '#f9fafb',
            textSecondary: '#7f8a9b',
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
            primaryShadow: 'rgba(5, 150, 105, 0.1)',
            secondary: '#6b7280',
            secondaryShadow: 'rgba(107, 114, 128, 0.1)',
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
            primaryShadow: 'rgba(5, 150, 105, 0.2)',
            secondaryShadow: 'rgba(156, 163, 175, 0.2)',
            background: '#062e21',
            surface: '#0a3d2c',
            text: '#d1fae5',
            textSecondary: '#7f8a9b',
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
            primaryShadow: 'rgba(234, 88, 12, 0.1)',
            secondary: '#6b7280',
            secondaryShadow: 'rgba(107, 114, 128, 0.1)',
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
            primaryShadow: 'rgba(234, 88, 12, 0.2)',
            secondaryShadow: 'rgba(156, 163, 175, 0.2)',
            background: '#431407',
            surface: '#5e1c0a',
            text: '#ffedd5',
            textSecondary: '#7f8a9b',
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
            primaryShadow: 'rgba(124, 58, 237, 0.1)',
            secondary: '#6b7280',
            secondaryShadow: 'rgba(107, 114, 128, 0.1)',
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
            primaryShadow: 'rgba(124, 58, 237, 0.2)',
            secondaryShadow: 'rgba(156, 163, 175, 0.2)',
            background: '#2e1065',
            surface: '#3f0f87',
            text: '#f3e8ff',
            textSecondary: '#7f8a9b',
            border: '#5b21b6',
            accent: '#ec4899',
            gradient: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)'
        }
    },
    sepia: {
        name: 'Warm Sepia',
        lightColors: {
            primary: '#a0522d',
            primaryHover: '#8b4513',
            primaryShadow: 'rgba(160, 82, 45, 0.1)',
            secondary: '#8b8070',
            secondaryShadow: 'rgba(139, 128, 112, 0.1)',
            background: '#fbf8f3',
            surface: '#f5efdf',
            text: '#5a4a3a',
            textSecondary: '#8b8070',
            border: '#e0d8c7',
            accent: '#d2691e',
            gradient: 'linear-gradient(135deg, #cd853f 0%, #a0522d 100%)'
        },
        darkColors: {
            primary: '#d2691e',
            primaryHover: '#b85c1a',
            primaryShadow: 'rgba(210, 105, 30, 0.2)',
            secondary: '#a89a8a',
            secondaryShadow: 'rgba(168, 154, 138, 0.2)',
            background: '#3a302a',
            surface: '#4d4038',
            text: '#f5e5d5',
            textSecondary: '#a89a8a',
            border: '#6b5a4d',
            accent: '#e67e22',
            gradient: 'linear-gradient(135deg, #8b4513 0%, #d2691e 100%)'
        }
    },
    mint: {
        name: 'Cool Mint',
        lightColors: {
            primary: '#20c997',
            primaryHover: '#17a2b8',
            primaryShadow: 'rgba(32, 201, 151, 0.1)',
            secondary: '#6c757d',
            secondaryShadow: 'rgba(108, 117, 125, 0.1)',
            background: '#f0fdfa',
            surface: '#ffffff',
            text: '#212529',
            textSecondary: '#6c757d',
            border: '#e2fcf5',
            accent: '#6f42c1',
            gradient: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)'
        },
        darkColors: {
            primary: '#20c997',
            primaryHover: '#17a2b8',
            primaryShadow: 'rgba(32, 201, 151, 0.2)',
            secondary: '#a8b3bb',
            secondaryShadow: 'rgba(168, 179, 187, 0.2)',
            background: '#1a2a2a',
            surface: '#2a3a3a',
            text: '#e0fdfa',
            textSecondary: '#a8b3bb',
            border: '#3a4a4a',
            accent: '#6f42c1',
            gradient: 'linear-gradient(135deg, #17a2b8 0%, #20c997 100%)'
        }
    },
    contrast: {
        name: 'High Contrast',
        lightColors: {
            primary: '#000000',
            primaryHover: '#333333',
            primaryShadow: 'rgba(0, 0, 0, 0.15)',
            secondary: '#555555',
            secondaryShadow: 'rgba(85, 85, 85, 0.15)',
            background: '#ffffff',
            surface: '#f0f0f0',
            text: '#000000',
            textSecondary: '#333333',
            border: '#cccccc',
            accent: '#ff0000',
            gradient: 'linear-gradient(135deg, #333333 0%, #000000 100%)'
        },
        darkColors: {
            primary: '#ffffff',
            primaryHover: '#cccccc',
            primaryShadow: 'rgba(255, 255, 255, 0.15)',
            secondary: '#aaaaaa',
            secondaryShadow: 'rgba(170, 170, 170, 0.15)',
            background: '#000000',
            surface: '#1a1a1a',
            text: '#ffffff',
            textSecondary: '#cccccc',
            border: '#333333',
            accent: '#ff0000',
            gradient: 'linear-gradient(135deg, #333333 0%, #000000 100%)'
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
