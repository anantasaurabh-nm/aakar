import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

interface UiState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;
  userMenuOpen: boolean;
  setUserMenuOpen: (open: boolean) => void;
  toasts: { id: string; message: string; tone: 'success' | 'error' }[];
  pushToast: (message: string, tone?: 'success' | 'error') => void;
  dismissToast: (id: string) => void;
}

function applyTheme(theme: ThemePreference) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function readInitialTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem('doers-os-theme');
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export const useUiStore = create<UiState>((set) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') window.localStorage.setItem('doers-os-theme', theme);
    applyTheme(theme);
    set({ theme });
  },
  aiPanelOpen: false,
  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
  userMenuOpen: false,
  setUserMenuOpen: (open) => set({ userMenuOpen: open }),
  toasts: [],
  pushToast: (message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

if (typeof window !== 'undefined') {
  applyTheme(readInitialTheme());
}
