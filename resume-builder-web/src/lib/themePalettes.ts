'use client';

import { auroraLight, quantumDark, createTheme, type ThemeTokens } from 'tekivex-ui';

/**
 * Colour palettes handed to tekivex-ui.
 *
 * Kept separate from ./theme because importing 'tekivex-ui' pulls in
 * React.createContext at module scope, which throws in a Server Component.
 * Only client code may import this file.
 *
 * tekivex-ui components do NOT read our CSS custom properties. They pull
 * colours from ThemeContext and write them as inline `style` attributes
 * (e.g. `style={{ color: '#1a1815' }}` on TkxTitle), which no stylesheet can
 * override. So the design system needs the same palette handed to it in JS
 * that globals.css defines in CSS, or the two drift apart and dark mode
 * silently breaks - headings sat near-black on a near-black background.
 *
 * Every value below MUST match its counterpart in app/globals.css. If you
 * change a colour there, change it here in the same commit.
 */

/** Mirrors the `:root` block in globals.css. */
export const callbackLight: ThemeTokens = createTheme(auroraLight, {
  bg: '#f5f6fb',          // --bg
  surface: '#ffffff',     // --card
  surfaceAlt: '#f7f9fd',  // --surface-alt
  border: '#e6e8f2',      // --border
  text: '#0f172a',        // --ink
  textMuted: '#64748b',   // --muted
  primary: '#4f46e5',     // --primary
  secondary: '#7c3aed',   // --accent-2
  danger: '#dc2626',      // --danger
  warning: '#d97706',     // --warning
  success: '#059669',     // --success
  info: '#0284c7',        // --info
});

/** Mirrors the `[data-theme="dark"]` block in globals.css. */
export const callbackDark: ThemeTokens = createTheme(quantumDark, {
  bg: '#0b1020',
  surface: '#151b2e',
  surfaceAlt: '#121828',
  border: '#263149',
  text: '#e8ecf8',
  textMuted: '#8290ad',
  primary: '#818cf8',
  secondary: '#a78bfa',
  danger: '#f87171',
  warning: '#fbbf24',
  success: '#34d399',
  info: '#38bdf8',
});
