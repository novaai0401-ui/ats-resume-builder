/**
 * R-107 — where to send a user back to after they sign in.
 *
 * This exists because three call sites each built the return path by hand
 * and two of them dropped the query string: AuthGate stored `pathname`
 * only, so a signed-out user arriving from an assistant at
 * `/resume?resumeId=abc` landed back on a bare `/resume` after logging in.
 * The resume they were sent to open was simply gone — the handoff
 * dead-ended at exactly the moment it had earned a signup.
 *
 * One definition, used everywhere, so the next call site cannot get it
 * wrong in a new way.
 */
export function buildReturnPath(pathname: string | null | undefined, search?: string | null): string {
  const path = pathname || '/dashboard';
  const query = String(search || '').replace(/^\?/, '');
  return query ? `${path}?${query}` : path;
}
