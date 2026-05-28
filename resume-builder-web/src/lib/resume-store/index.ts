/**
 * ResumeStore — high-level local-first API for resume CRUD + version
 * snapshots. Sits on top of a swappable `ResumeStoreBackend`.
 *
 * Contract guarantees:
 *  - Resume payloads NEVER leave the local backend unless the caller
 *    explicitly passes them to a server API.
 *  - Every write stamps `updatedAt` and bumps `version` so we have
 *    enough metadata to detect cross-device conflicts later.
 *  - Reads return a fresh deep copy — callers may mutate freely.
 *  - The store is single-user. The currently-logged-in user's ID is
 *    captured in the `meta` store on first save so we can prevent
 *    cross-account data leakage in the same browser profile.
 */

import type { Resume } from 'resume-builder-shared';
import {
  META_STORE,
  RESUMES_STORE,
  VERSIONS_STORE,
  type ResumeStoreBackend,
  type StoredRecord,
} from './backend';
import { MemoryBackend } from './memory-backend';

export interface LocalResumeVersion {
  id: string;
  resumeId: string;
  label?: string | null;
  atsScoreSnapshot?: number | null;
  snapshot: Resume;
  createdAt: string;
}

export interface ResumeStoreOwnerMismatch {
  storedOwnerId: string;
  attemptedOwnerId: string;
}

export class ResumeOwnerMismatchError extends Error {
  constructor(public detail: ResumeStoreOwnerMismatch) {
    super(
      `Local store belongs to ${detail.storedOwnerId} but ${detail.attemptedOwnerId} is logged in. Clear local data or switch accounts.`,
    );
    this.name = 'ResumeOwnerMismatchError';
  }
}

export class ResumeStore {
  constructor(private readonly backend: ResumeStoreBackend) {}

  static withMemory(): ResumeStore {
    return new ResumeStore(new MemoryBackend());
  }

  async open(): Promise<void> {
    await this.backend.open();
  }

  // ---------------------------------------------------------------------------
  // Ownership — prevents account A's IndexedDB being read by account B in the
  // same browser profile after a logout/login.
  // ---------------------------------------------------------------------------
  async assertOwner(userId: string): Promise<void> {
    await this.open();
    const meta = await this.backend.get(META_STORE, 'owner');
    if (!meta) {
      await this.backend.put(META_STORE, this.makeRecord('owner', { userId }, 1));
      return;
    }
    const stored = (meta.payload as { userId?: string })?.userId;
    if (stored && stored !== userId) {
      throw new ResumeOwnerMismatchError({ storedOwnerId: stored, attemptedOwnerId: userId });
    }
  }

  /**
   * Wipe everything in the local store. Used for opt-out, account
   * switching, or the user-facing "delete my local data" action.
   */
  async wipe(): Promise<void> {
    await this.open();
    await this.backend.clear(RESUMES_STORE);
    await this.backend.clear(VERSIONS_STORE);
    await this.backend.clear(META_STORE);
  }

  // ---------------------------------------------------------------------------
  // Resume CRUD
  // ---------------------------------------------------------------------------
  async saveResume(resume: Resume): Promise<Resume> {
    await this.open();
    if (!resume.id) throw new Error('Resume.id is required for local save.');
    const existing = await this.backend.get(RESUMES_STORE, resume.id);
    const nextVersion = (existing?.version ?? 0) + 1;
    const stamped: Resume = { ...resume, updatedAt: new Date().toISOString() };
    await this.backend.put(RESUMES_STORE, this.makeRecord(resume.id, stamped, nextVersion));
    return stamped;
  }

  async getResume(id: string): Promise<Resume | null> {
    await this.open();
    const rec = await this.backend.get(RESUMES_STORE, id);
    return rec ? (deepClone(rec.payload) as Resume) : null;
  }

  async listResumes(): Promise<Resume[]> {
    await this.open();
    const rows = await this.backend.list(RESUMES_STORE);
    return rows
      .map((r) => deepClone(r.payload) as Resume)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async deleteResume(id: string): Promise<void> {
    await this.open();
    await this.backend.delete(RESUMES_STORE, id);
    // Cascade: remove version snapshots that belonged to this resume.
    const versions = await this.backend.list(VERSIONS_STORE);
    for (const v of versions) {
      const payload = v.payload as LocalResumeVersion;
      if (payload?.resumeId === id) {
        await this.backend.delete(VERSIONS_STORE, v.id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Version snapshots
  // ---------------------------------------------------------------------------
  async snapshotVersion(resumeId: string, label?: string, atsScoreSnapshot?: number): Promise<LocalResumeVersion> {
    const resume = await this.getResume(resumeId);
    if (!resume) throw new Error(`Resume ${resumeId} not found locally`);
    const version: LocalResumeVersion = {
      id: makeId(),
      resumeId,
      label: label?.trim() || null,
      atsScoreSnapshot: typeof atsScoreSnapshot === 'number' ? atsScoreSnapshot : null,
      snapshot: deepClone(resume),
      createdAt: new Date().toISOString(),
    };
    await this.backend.put(VERSIONS_STORE, this.makeRecord(version.id, version, 1));
    return version;
  }

  async listVersions(resumeId: string): Promise<LocalResumeVersion[]> {
    await this.open();
    const rows = await this.backend.list(VERSIONS_STORE);
    return rows
      .map((r) => deepClone(r.payload) as LocalResumeVersion)
      .filter((v) => v?.resumeId === resumeId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async restoreVersion(versionId: string): Promise<Resume> {
    await this.open();
    const rec = await this.backend.get(VERSIONS_STORE, versionId);
    if (!rec) throw new Error(`Version ${versionId} not found locally`);
    const version = rec.payload as LocalResumeVersion;
    const restored: Resume = { ...version.snapshot, updatedAt: new Date().toISOString() };
    await this.saveResume(restored);
    return restored;
  }

  async deleteVersion(versionId: string): Promise<void> {
    await this.open();
    await this.backend.delete(VERSIONS_STORE, versionId);
  }

  // ---------------------------------------------------------------------------
  // Export / Import — the user owns their data. This is non-negotiable.
  // ---------------------------------------------------------------------------
  async exportAll(): Promise<LocalExportBundle> {
    await this.open();
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      resumes: await this.listResumes(),
      versions: (await this.backend.list(VERSIONS_STORE)).map((r) => deepClone(r.payload) as LocalResumeVersion),
    };
  }

  async importAll(bundle: LocalExportBundle): Promise<void> {
    if (!bundle || bundle.schemaVersion !== 1) {
      throw new Error('Unsupported export bundle.');
    }
    await this.open();
    for (const resume of bundle.resumes || []) {
      await this.saveResume(resume);
    }
    for (const version of bundle.versions || []) {
      if (!version?.id) continue;
      await this.backend.put(VERSIONS_STORE, this.makeRecord(version.id, version, 1));
    }
  }

  // ---------------------------------------------------------------------------
  private makeRecord(id: string, payload: unknown, version: number): StoredRecord {
    return { id, payload: deepClone(payload), updatedAt: new Date().toISOString(), version };
  }
}

export interface LocalExportBundle {
  schemaVersion: 1;
  exportedAt: string;
  resumes: Resume[];
  versions: LocalResumeVersion[];
}

function makeId(): string {
  // Browser-grade random ID — cuid-like length, not cryptographically
  // strong but plenty for client-only keys.
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `lv_${rand()}${rand()}`;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Singleton factory — picks the best backend for the current environment.
// Lazy so SSR never touches IndexedDB.
// ---------------------------------------------------------------------------
let cachedStore: ResumeStore | null = null;

export async function getResumeStore(): Promise<ResumeStore> {
  if (cachedStore) return cachedStore;
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    cachedStore = ResumeStore.withMemory();
    return cachedStore;
  }
  const { IndexedDBBackend } = await import('./indexeddb-backend');
  cachedStore = new ResumeStore(new IndexedDBBackend());
  await cachedStore.open();
  return cachedStore;
}

/** Test helper — never use in production code paths. */
export function __resetResumeStoreSingleton(): void {
  cachedStore = null;
}

export { MemoryBackend } from './memory-backend';
export type { ResumeStoreBackend } from './backend';
