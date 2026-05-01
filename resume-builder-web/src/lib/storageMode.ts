/**
 * Single source of truth for "where do resumes live" on the web.
 *
 * Mirrors the mobile-side decision in resume-builder-mobile/lib/storageMode.ts
 * so the privacy guarantee is identical on both clients. Default 'local'
 * means resumes go straight into IndexedDB and never reach our server.
 *
 * The pref is stored in localStorage (synchronous, survives reload, lives
 * exactly as long as IndexedDB does — same eviction policy). It's a
 * non-secret preference, so localStorage is the right home for it.
 */

import { api } from './api';
import type { Resume } from './api';
import { localResumeStore } from './localResumeStore';

const PREF_KEY = 'rb_storage_mode';
const MIGRATED_KEY = 'rb_local_migrated';

export type StorageMode = 'local' | 'cloud';

function readWindowStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeWindowStorage(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota exceeded — silently no-op */
  }
}

export function getStorageMode(): StorageMode {
  return readWindowStorage(PREF_KEY) === 'cloud' ? 'cloud' : 'local';
}

export function setStorageMode(mode: StorageMode): void {
  writeWindowStorage(PREF_KEY, mode);
}

/**
 * One-time pull-down of cloud resumes into IndexedDB. Idempotent.
 * Failure (offline, no server resumes) is non-fatal.
 */
export async function migrateCloudToLocalIfNeeded(): Promise<void> {
  if (readWindowStorage(MIGRATED_KEY)) return;
  try {
    const cloudResumes = await api.listResumes();
    const list = Array.isArray(cloudResumes) ? cloudResumes : [];
    if (list.length > 0) {
      const local = await localResumeStore.list();
      const localIds = new Set(local.map((r: Resume) => r.id));
      const toImport = list.filter((r: Resume) => !localIds.has(r.id));
      await localResumeStore.importAll([...local, ...toImport]);
    }
    writeWindowStorage(MIGRATED_KEY, '1');
  } catch {
    /* try again next launch */
  }
}

export const resumeStore = {
  async list(): Promise<Resume[]> {
    return getStorageMode() === 'local' ? localResumeStore.list() : api.listResumes();
  },
  async get(id: string): Promise<Resume | null> {
    if (getStorageMode() === 'local') return localResumeStore.get(id);
    try { return await api.getResume(id); } catch { return null; }
  },
  async create(data: Partial<Resume>): Promise<Resume> {
    return getStorageMode() === 'local' ? localResumeStore.create(data) : api.createResume(data as never);
  },
  async update(id: string, patch: Partial<Resume>): Promise<Resume> {
    return getStorageMode() === 'local'
      ? localResumeStore.update(id, patch)
      : api.updateResume(id, patch as never);
  },
  async delete(id: string): Promise<void> {
    if (getStorageMode() === 'local') { await localResumeStore.delete(id); return; }
    await api.deleteResume(id);
  },
};
