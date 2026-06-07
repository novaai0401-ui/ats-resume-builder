/**
 * Pure rule the resume editor uses to decide whether a fetch is the
 * INITIAL load (show a "Loading your resume…" spinner) or a
 * background re-fetch (refresh quietly, no spinner).
 *
 * Why this exists: the editor's effective resume id can change
 * mid-session — most notably right after autosave assigns an id to a
 * draft that started without one. That flip re-runs the load effect.
 * Without this guard, the loader toggled on every re-fetch and the
 * screen flickered editor → loader → editor → editor (regression
 * reported as "Continue to Review reloads multiple times").
 *
 * Rule: the load is "initial" iff the editor currently has NO
 * user-visible content. Any non-empty summary, skill, language,
 * experience, education, project, achievement, or certification
 * means the editor is mid-session and a background re-fetch must
 * NOT replace the surface with a spinner.
 *
 * Kept in its own module (no React, no editor imports) so the
 * rule is unit-testable without booting the editor.
 */

export interface HasResumeContentInput {
  summary?: string | null;
  skills?: ReadonlyArray<string | null | undefined> | null;
  languages?: ReadonlyArray<string | null | undefined> | null;
  experience?: ReadonlyArray<{ company?: string | null; role?: string | null; highlights?: ReadonlyArray<string | null | undefined> | null } | null | undefined> | null;
  education?: ReadonlyArray<{ institution?: string | null; degree?: string | null } | null | undefined> | null;
  projects?: ReadonlyArray<{ name?: string | null; highlights?: ReadonlyArray<string | null | undefined> | null } | null | undefined> | null;
  achievements?: ReadonlyArray<string | null | undefined> | null;
  certifications?: ReadonlyArray<{ name?: string | null } | null | undefined> | null;
}

function hasMeaningful(values?: ReadonlyArray<string | null | undefined> | null): boolean {
  if (!values || values.length === 0) return false;
  return values.some((v) => String(v || '').trim().length > 0);
}

export function isEmptyDraft(input: HasResumeContentInput): boolean {
  if (String(input.summary || '').trim()) return false;
  if (hasMeaningful(input.skills)) return false;
  if (hasMeaningful(input.languages)) return false;
  if (hasMeaningful(input.achievements)) return false;
  if ((input.experience || []).some((e) => String(e?.company || '').trim() || String(e?.role || '').trim() || hasMeaningful(e?.highlights))) return false;
  if ((input.education || []).some((e) => String(e?.institution || '').trim() || String(e?.degree || '').trim())) return false;
  if ((input.projects || []).some((p) => String(p?.name || '').trim() || hasMeaningful(p?.highlights))) return false;
  if ((input.certifications || []).some((c) => String(c?.name || '').trim())) return false;
  return true;
}

/**
 * Should the editor render a fullscreen "Loading your resume…"
 * spinner for this fetch, or refresh silently?
 *
 * @param fetchInFlight true while api.getResume is pending.
 * @param currentDraft  the editor's current draft snapshot.
 */
export function shouldShowHydrationLoader(
  fetchInFlight: boolean,
  currentDraft: HasResumeContentInput,
): boolean {
  if (!fetchInFlight) return false;
  return isEmptyDraft(currentDraft);
}
