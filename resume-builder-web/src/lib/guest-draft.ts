/**
 * Guest resume drafting (try-before-signup).
 *
 * An anonymous visitor can draft a resume in the editor. The draft is
 * held ONLY in localStorage under `rb_guest_draft` (canonical
 * ResumeDraft shape from the resume store). Nothing is sent to the
 * server until the user creates an account; after auth the editor's
 * load path imports the draft via the normal create/save flow and
 * clears the key (see shouldImportGuestDraft + ResumeEditor).
 */

import type { ResumeDraft } from './resume-store';

export const GUEST_DRAFT_KEY = 'rb_guest_draft';

export type GuestDraft = {
  resume: ResumeDraft;
  savedAt: number;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGuestDraft(resume: ResumeDraft, storage?: StorageLike): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    const draft: GuestDraft = { resume, savedAt: Date.now() };
    target.setItem(GUEST_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function readGuestDraft(storage?: StorageLike): GuestDraft | null {
  const target = resolveStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(GUEST_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestDraft;
    if (!parsed || typeof parsed !== 'object') return null;
    const resume = parsed.resume;
    if (!resume || typeof resume !== 'object') return null;
    if (typeof resume.title !== 'string' || !resume.contact || typeof resume.contact !== 'object') {
      return null;
    }
    return {
      resume,
      savedAt: Number(parsed.savedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function clearGuestDraft(storage?: StorageLike): void {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.removeItem(GUEST_DRAFT_KEY);
  } catch {
    // ignore — best effort.
  }
}

export function hasGuestDraft(storage?: StorageLike): boolean {
  return readGuestDraft(storage) !== null;
}

/**
 * Pure gate for the editor's authed load path: import the pending guest
 * draft as the working resume ONLY when the user is authenticated, no
 * explicit resume id claims the editor, a draft exists, and no pending
 * upload session takes precedence.
 */
export function shouldImportGuestDraft(input: {
  hasToken: boolean;
  resumeId: string;
  hasDraft: boolean;
  hasPendingUpload: boolean;
}): boolean {
  return (
    input.hasToken &&
    !String(input.resumeId || '').trim() &&
    input.hasDraft &&
    !input.hasPendingUpload
  );
}

/**
 * Pure gate for guest-side hydration: restore the local draft into the
 * store when the visitor has no token and nothing else (scratch flow,
 * pending upload, explicit id) owns the editor surface.
 */
export function shouldRestoreGuestDraft(input: {
  hasToken: boolean;
  resumeId: string;
  flowParam: string;
  hasPendingUpload: boolean;
  hasDraft: boolean;
}): boolean {
  return (
    !input.hasToken &&
    !String(input.resumeId || '').trim() &&
    input.flowParam !== 'scratch' &&
    !input.hasPendingUpload &&
    input.hasDraft
  );
}
