/**
 * Canonical design tokens — the single source of truth for colors used in
 * JS/inline styles, mirroring the CSS custom properties in app/globals.css.
 *
 * Components that can't reach a CSS variable (charts, inline styles, the OG
 * image) should import from here instead of hardcoding hex, so the palette
 * stays consistent and is changed in one place.
 */

export const colors = {
  bg: '#f4f7fb',
  ink: '#142235',
  muted: '#5a6778',
  border: '#dde6ef',
  surface: '#eef3f9',
  surfaceAlt: '#f5f8fc',
  primary: '#2f5f8f',
  primary600: '#2b6cb0',
  primary700: '#234e74',
  success: '#147a3a',
  warning: '#b07906',
  danger: '#b3261e',
} as const;

export type ColorToken = keyof typeof colors;

export const radius = { sm: 8, md: 10, lg: 14 } as const;

/** Map a 0..1 callback/score rate to a semantic color (shared grading). */
export function rateToColor(rate: number): string {
  if (!Number.isFinite(rate)) return colors.muted;
  const pct = rate * 100;
  if (pct >= 20) return colors.success;
  if (pct >= 8) return colors.warning;
  return colors.danger;
}
