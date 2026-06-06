/**
 * The post-autosave refetch flicker.
 *
 * Sequence the editor used to produce:
 *
 *   t=0     pending-upload effect populates the draft from local
 *           session → resume content visible
 *   t=500   ATS effect debounce fires → "Checking ATS…"
 *   t=600   refreshReviewAts has no resumeId yet → autosave kicks off
 *   t=900   autosave returns → setResumeId(<id>) +
 *           persistActiveResumeSelection(<id>) → ATS computes →
 *           ATS score visible
 *   t=920   effectiveResumeId flips from '' → '<id>' because
 *           resolveCurrentSessionResumeId now reads the persisted id.
 *           LOAD EFFECT FIRES → api.getResume(<id>) starts. We
 *           already have this resume — the fetch is redundant.
 *   t=1200  setResume(loadedResume) replaces the local copy with a
 *           structurally-identical normalized one. ATS effect sees
 *           `resume` changed → resets and re-debounces → ATS score
 *           disappears
 *   t=1700  ATS recomputes → same score → re-appears
 *
 * The user sees: editor → ATS → vanish → flicker → ATS.
 *
 * The fix: track the last id we have locally-canonical content for,
 * and skip the load effect when effectiveResumeId matches.
 *
 * shouldSkipServerHydration returns true iff the load effect can
 * safely no-op because the local state IS the server-canonical state.
 */
export function shouldSkipServerHydration(
  effectiveResumeId: string,
  locallySettledResumeId: string,
): boolean {
  const next = String(effectiveResumeId || '').trim();
  const settled = String(locallySettledResumeId || '').trim();
  // Both must be non-empty AND match. An empty effectiveResumeId
  // means we have no resume to load, and an empty settled-ref means
  // we have never confirmed local-canonical content yet.
  if (!next || !settled) return false;
  return next === settled;
}
