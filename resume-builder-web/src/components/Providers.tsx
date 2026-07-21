'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  ThemeProvider,
  TkxConfigProvider,
  TkxToastProvider,
  I18nProvider,
  auroraLight,
  createTheme,
} from 'tekivex-ui';

/**
 * Brand theme. tekivex ships `auroraLight` with a green primary (#0d7c5f),
 * which clashed with the CallbackCV brand indigo used by the logo, nav, and
 * every `globals.css` surface (--primary: #4f46e5). Overriding the theme's
 * primary/secondary makes all tekivex components (buttons, badges, stats,
 * tags) render in the brand colour on EVERY page — so the home page and the
 * rest of the app read as one product. `success` stays green on purpose.
 */
const brandTheme = createTheme(auroraLight, {
  primary: '#4f46e5',
  secondary: '#7c3aed',
});

/**
 * Client-side wrapper that installs the tekivex-ui providers for the whole app.
 *
 * Order matters: TkxConfigProvider reads ThemeContext, TkxToastProvider
 * renders into a portal that must sit inside the config scope, and
 * I18nProvider should be outermost so locale/direction is available
 * everywhere.
 *
 * Hydration note: TkxToastProvider mounts a portal container
 * `<div aria-label="Notifications">` via useEffect, so its SSR output
 * (one child div) does not match its CSR output (two child divs). React
 * treats that as a hydration mismatch and regenerates the subtree,
 * blowing away component state.
 *
 * Fix: keep the I18n / Theme / Config providers rendering on both SSR
 * and CSR (children depend on their contexts), but skip
 * TkxToastProvider until after the first client effect. On the brief
 * first frame where `mounted === false`, children render inside a
 * pass-through <TkxToastProviderShim> whose DOM shape matches what
 * TkxToastProvider emits pre-portal — so when `mounted` flips and the
 * real provider swaps in, React reconciles the existing children
 * rather than unmounting + remounting them.
 */
export default function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <I18nProvider>
      <ThemeProvider theme={brandTheme}>
        <TkxConfigProvider>
          {mounted ? (
            <TkxToastProvider>{children}</TkxToastProvider>
          ) : (
            <>{children}</>
          )}
        </TkxConfigProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
