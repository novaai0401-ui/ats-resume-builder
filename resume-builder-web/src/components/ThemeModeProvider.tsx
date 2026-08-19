'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { THEME_STORAGE_KEY, resolveMode, type ThemeMode } from '@/src/lib/theme';

type ThemeModeContextValue = {
  /** What the user chose: light, dark, or follow the OS. */
  mode: ThemeMode;
  /** What is actually on screen right now. */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: 'system',
  resolved: 'light',
  setMode: () => {},
});

export function useThemeMode(): ThemeModeContextValue {
  return useContext(ThemeModeContext);
}

/**
 * Owns the light/dark preference for the whole app.
 *
 * Two consumers have to stay in sync or the UI half-themes itself:
 *   1. globals.css, which keys off `data-theme` on <html>.
 *   2. tekivex-ui, which reads colours from JS and inlines them.
 * This provider drives (1) directly and hands the resolved mode to
 * Providers.tsx for (2).
 *
 * SSR note: state starts at 'system' on both server and client so the first
 * render matches. The real preference is applied in an effect, while the
 * no-flash script in <head> has already stamped the correct `data-theme`
 * before paint — so there is no visible flash despite the deferred state.
 */
export default function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Adopt the stored preference once we are on the client.
  useEffect(() => {
    let stored: ThemeMode = 'system';
    try {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') stored = raw;
    } catch {
      // Private mode / storage disabled - fall back to following the OS.
    }
    setModeState(stored);
    setResolved(resolveMode(stored));
  }, []);

  // Keep <html data-theme> and the resolved value in step with the choice,
  // and follow the OS live while the user is on 'system'.
  useEffect(() => {
    const apply = () => {
      const next = resolveMode(mode);
      setResolved(next);
      document.documentElement.setAttribute('data-theme', next);
    };
    apply();

    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference just will not persist; the session still themes correctly.
    }
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}
