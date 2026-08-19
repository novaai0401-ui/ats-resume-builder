'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  ThemeProvider,
  TkxConfigProvider,
  TkxToastProvider,
  I18nProvider,
} from 'tekivex-ui';
import ThemeModeProvider, { useThemeMode } from './ThemeModeProvider';
import { callbackLight, callbackDark } from '@/src/lib/themePalettes';

/**
 * Feeds the resolved theme to tekivex-ui.
 *
 * This used to pass a single static `theme={brandTheme}` built from
 * `auroraLight`, whose `text` is #1a1815. Because tekivex components inline
 * their colours as `style` attributes rather than reading CSS variables, that
 * near-black text stayed put when the page went dark — headings ended up
 * invisible on the dark background and no stylesheet could override an inline
 * style. Passing lightTheme/darkTheme plus the resolved mode makes the library
 * re-render with the correct palette instead.
 *
 * Both palettes live in src/lib/theme.ts and must stay in step with the token
 * blocks in globals.css.
 */
function ThemedTekivex({ children }: { children: ReactNode }) {
  const { resolved } = useThemeMode();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <ThemeProvider
      lightTheme={callbackLight}
      darkTheme={callbackDark}
      mode={resolved}
      suppressHydrationWarning
    >
      <TkxConfigProvider>
        {/* Hydration note: TkxToastProvider mounts a portal container
         * `<div aria-label="Notifications">` in an effect, so its SSR output
         * (one child div) does not match its CSR output (two). React treats
         * that as a mismatch and regenerates the subtree, blowing away
         * component state. Rendering children bare on the first frame keeps
         * the DOM shape stable, so when `mounted` flips the real provider
         * swaps in by reconciliation rather than unmount + remount. */}
        {mounted ? <TkxToastProvider>{children}</TkxToastProvider> : <>{children}</>}
      </TkxConfigProvider>
    </ThemeProvider>
  );
}

/**
 * Client-side wrapper that installs every app-wide provider.
 *
 * Order matters: I18nProvider is outermost so locale/direction is available
 * everywhere, and ThemeModeProvider must wrap ThemedTekivex because the
 * latter reads the resolved light/dark mode from it.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeModeProvider>
        <ThemedTekivex>{children}</ThemedTekivex>
      </ThemeModeProvider>
    </I18nProvider>
  );
}
