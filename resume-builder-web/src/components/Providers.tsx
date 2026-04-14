'use client';

import type { ReactNode } from 'react';
import {
  ThemeProvider,
  TkxConfigProvider,
  TkxToastProvider,
  I18nProvider,
  auroraLight,
} from 'tekivex-ui';

/**
 * Client-side wrapper that installs the tekivex-ui providers for the whole app.
 *
 * Order matters: TkxConfigProvider reads ThemeContext, TkxToastProvider
 * renders into a portal that must sit inside the config scope, and
 * I18nProvider should be outermost so locale/direction is available
 * everywhere.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider theme={auroraLight}>
        <TkxConfigProvider>
          <TkxToastProvider>{children}</TkxToastProvider>
        </TkxConfigProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
