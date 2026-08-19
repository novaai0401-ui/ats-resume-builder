/**
 * Server-safe theme primitives.
 *
 * IMPORTANT: this module must NOT import from 'tekivex-ui'. The library's
 * barrel calls React.createContext at module scope, which throws inside a
 * React Server Component - and app/layout.tsx (a server component) imports
 * themeNoFlashScript from here. The colour palettes, which do need the
 * library, live in ./themePalettes and are imported only by client code.
 */

/** User's stored preference. 'system' follows the OS. */
export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'callbackcv-theme';

/**
 * Runs before first paint, inlined in <head>, so the page never flashes the
 * wrong theme. Deliberately tiny and dependency-free: it resolves the stored
 * preference to a concrete light/dark and stamps `data-theme` on <html>,
 * which is what the CSS token blocks key off.
 */
export function themeNoFlashScript(): string {
  return `(function(){try{
var m=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';
var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',d?'dark':'light');
}catch(e){}})();`;
}

/** Resolve a stored preference to the theme actually being shown. */
export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}
