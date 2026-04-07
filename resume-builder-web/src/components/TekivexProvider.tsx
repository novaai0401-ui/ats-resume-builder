'use client';

import { ThemeProvider } from 'tekivex-ui';
import type { ReactNode } from 'react';

export function TekivexProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
