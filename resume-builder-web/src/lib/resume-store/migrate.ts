/**
 * Server-to-local migration.
 *
 * For users who joined before the local-first cutover, their resumes
 * live in Postgres. On first login post-deploy we offer a one-time
 * migration: pull the server payload, write it to IndexedDB, then call
 * the server to either (a) wipe its payload columns or (b) stamp a
 * "migrated" flag — handled in a future commit when the schema change
 * lands.
 *
 * This file is intentionally idempotent: running it twice is safe. It
 * also avoids overwriting local-only edits the user has made since.
 */

import type { Resume } from 'resume-builder-shared';
import { api, getCurrentUserId } from '@/src/lib/api';
import { ResumeOwnerMismatchError, getResumeStore } from './index';

export interface MigrationReport {
  status: 'completed' | 'skipped' | 'no-server-data' | 'owner-mismatch' | 'error';
  imported: number;
  skipped: number;
  errors: Array<{ resumeId: string; message: string }>;
}

const MIGRATION_KEY = 'rb_local_first_migrated_v1';

/**
 * Pull existing server resumes into the local store. Runs once per user
 * per browser. Idempotent — subsequent calls return `skipped`.
 */
export async function migrateServerResumesToLocal(): Promise<MigrationReport> {
  const userId = getCurrentUserId();
  if (!userId) {
    return { status: 'skipped', imported: 0, skipped: 0, errors: [] };
  }
  if (alreadyMigrated(userId)) {
    return { status: 'skipped', imported: 0, skipped: 0, errors: [] };
  }

  const store = await getResumeStore();
  try {
    await store.assertOwner(userId);
  } catch (error) {
    if (error instanceof ResumeOwnerMismatchError) {
      return { status: 'owner-mismatch', imported: 0, skipped: 0, errors: [{ resumeId: '-', message: error.message }] };
    }
    throw error;
  }

  let serverResumes: Resume[] = [];
  try {
    serverResumes = (await api.listResumes()) as Resume[];
  } catch (error) {
    return {
      status: 'error',
      imported: 0,
      skipped: 0,
      errors: [{ resumeId: '-', message: error instanceof Error ? error.message : String(error) }],
    };
  }

  if (!Array.isArray(serverResumes) || serverResumes.length === 0) {
    markMigrated(userId);
    return { status: 'no-server-data', imported: 0, skipped: 0, errors: [] };
  }

  const report: MigrationReport = { status: 'completed', imported: 0, skipped: 0, errors: [] };

  for (const serverResume of serverResumes) {
    try {
      const existing = await store.getResume(serverResume.id);
      // Conflict policy: server wins ONLY when there is no local copy.
      // If a local copy exists (because the user already started editing
      // on this device since deploy), keep it — never overwrite local
      // edits silently.
      if (existing) {
        report.skipped += 1;
        continue;
      }
      // Fetch the full resume in case the list endpoint returned a
      // summary. /resumes/:id always returns the full payload.
      let full: Resume = serverResume;
      try {
        full = (await api.getResume(serverResume.id)) as Resume;
      } catch {
        // Fall back to the list payload if the detail call fails.
      }
      await store.saveResume(full);
      report.imported += 1;
    } catch (error) {
      report.errors.push({
        resumeId: serverResume.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (report.errors.length === 0) {
    markMigrated(userId);
  }
  return report;
}

function alreadyMigrated(userId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${MIGRATION_KEY}:${userId}`) === 'true';
  } catch {
    return false;
  }
}

function markMigrated(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${MIGRATION_KEY}:${userId}`, 'true');
  } catch {
    // localStorage unavailable — accept the cost of re-running the migration on the next session.
  }
}

/** Test / debug helper — clears the migration sentinel so the flow runs again. */
export function resetMigrationFlag(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(`${MIGRATION_KEY}:${userId}`);
  } catch {
    /* ignore */
  }
}
