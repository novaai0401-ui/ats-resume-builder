'use client';

import { useEffect, useState } from 'react';
import { api, getAccessToken } from '@/src/lib/api';
import { useResumeStore, type ResumeDraft } from '@/src/lib/resume-store';
import { resolveCurrentSessionResumeId, resumeFromApi } from '@/src/lib/resume-flow';

/**
 * The in-memory resume store is only populated inside the editor, so AI
 * pages opened cold (Mentor, Skill-Demand) used to see an empty resume and
 * behave as if the user had none. This hook returns the store draft when it
 * has content, otherwise hydrates ONE saved resume from the API: the active
 * session selection if present, else the most recently saved resume.
 *
 * Returns `null` while nothing is available (guest, no saved resumes, or
 * fetch failed) — callers fall back to their existing empty-state copy.
 */
export function useSavedResumeFallback(): ResumeDraft | null {
  const storeResume = useResumeStore((s) => s.resume);
  const [hydrated, setHydrated] = useState<ResumeDraft | null>(null);

  // "Has content" = any signal a real resume is loaded. Checking a couple of
  // high-signal fields keeps this cheap and stable across draft shapes.
  const storeHasContent = Boolean(
    storeResume &&
      ((storeResume.contact?.fullName || '').trim() ||
        (storeResume.skills?.length ?? 0) > 0 ||
        (storeResume.experience?.length ?? 0) > 0),
  );

  useEffect(() => {
    if (storeHasContent || hydrated) return;
    if (!getAccessToken()) return;
    let cancelled = false;
    (async () => {
      try {
        let id = resolveCurrentSessionResumeId();
        if (!id) {
          const list = await api.listResumes();
          id = list?.[0]?.id ?? '';
        }
        if (!id) return;
        const full = await api.getResume(id);
        if (!cancelled) setHydrated(resumeFromApi(full));
      } catch {
        // Non-fatal: callers keep their "no resume yet" empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeHasContent, hydrated]);

  if (storeHasContent) return storeResume;
  return hydrated;
}
