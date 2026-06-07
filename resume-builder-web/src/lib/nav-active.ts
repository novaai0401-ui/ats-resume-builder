/**
 * Pure matcher used by TopNav to decide whether a link should render
 * with `aria-current="page"` (the visual highlight).
 *
 * Rules:
 *   - Home ('/') matches ONLY the exact path '/', never as a prefix —
 *     otherwise every page would also light up Home.
 *   - Any other link matches the exact path OR a sub-route prefix —
 *     '/resume' lights up on '/resume/start', '/resume/template', etc.
 *   - `excludePrefixes` lets a parent route opt OUT of claiming a
 *     sub-route that has its own dedicated nav entry. For example,
 *     /resume passes ['/resume/versions','/resume/outcomes',...] so
 *     the user never sees two highlighted tabs at once.
 *
 * Kept in its own module (no React, no Next imports) so the test
 * harness can exercise it without booting jsdom + tekivex-ui.
 */
export function isNavActive(
  pathname: string,
  href: string,
  excludePrefixes: string[] = [],
): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  for (const ex of excludePrefixes) {
    if (pathname === ex || pathname.startsWith(ex + '/')) return false;
  }
  return pathname === href || pathname.startsWith(href + '/');
}

/**
 * Routes that have their own dedicated nav entry — Resume must not
 * claim them even though they live under /resume/.
 */
export const RESUME_SUBROUTE_OWNED = [
  '/resume/versions',
  '/resume/outcomes',
  '/resume/ats-simulate',
];
