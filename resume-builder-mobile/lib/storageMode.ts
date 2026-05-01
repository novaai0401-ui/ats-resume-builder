/**
 * Single source of truth for "where do resumes live."
 *
 * Default: 'local'. We change this only if the user explicitly opts
 * into cloud sync in Settings. Existing accounts that already have
 * cloud-stored resumes get migrated to 'local' on first launch by
 * pulling them down once and writing them into the local store —
 * users see no data loss and gain the privacy guarantee.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, type Resume } from './api';
import { localResumeStore } from './localResumeStore';

const PREF_KEY = 'rb_storage_mode';
const MIGRATED_KEY = 'rb_local_migrated';

export type StorageMode = 'local' | 'cloud';

export async function getStorageMode(): Promise<StorageMode> {
  const raw = await AsyncStorage.getItem(PREF_KEY);
  return raw === 'cloud' ? 'cloud' : 'local';
}

export async function setStorageMode(mode: StorageMode) {
  await AsyncStorage.setItem(PREF_KEY, mode);
}

/**
 * Idempotent: pulls any existing cloud resumes into the local store
 * exactly once. Safe to call on every launch — guarded by a flag.
 * Failure (e.g. offline) is non-fatal; we'll try again next launch.
 */
export async function migrateCloudToLocalIfNeeded(): Promise<void> {
  if (await AsyncStorage.getItem(MIGRATED_KEY)) return;
  try {
    const cloudResumes = await api.listResumes();
    if (Array.isArray(cloudResumes) && cloudResumes.length > 0) {
      // Don't overwrite anything the user already has locally.
      const local = await localResumeStore.list();
      const localIds = new Set(local.map((r) => r.id));
      const toImport = cloudResumes.filter((r) => !localIds.has(r.id));
      await localResumeStore.importAll([...local, ...toImport]);
    }
    await AsyncStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    // Non-fatal. We'll retry on next launch.
  }
}

/**
 * Storage-mode-aware resume CRUD. Screens use `resumeStore.list()`
 * etc. and don't care whether it goes to local storage or the API.
 */
export const resumeStore = {
  async list(): Promise<Resume[]> {
    const mode = await getStorageMode();
    return mode === 'local' ? localResumeStore.list() : api.listResumes();
  },
  async get(id: string): Promise<Resume | null> {
    const mode = await getStorageMode();
    if (mode === 'local') return localResumeStore.get(id);
    try { return await api.getResume(id); } catch { return null; }
  },
  async create(data: Partial<Resume>): Promise<Resume> {
    const mode = await getStorageMode();
    return mode === 'local' ? localResumeStore.create(data) : api.createResume(data);
  },
  async update(id: string, patch: Partial<Resume>): Promise<Resume> {
    const mode = await getStorageMode();
    return mode === 'local' ? localResumeStore.update(id, patch) : api.updateResume(id, patch);
  },
  async delete(id: string): Promise<void> {
    const mode = await getStorageMode();
    if (mode === 'local') { await localResumeStore.delete(id); return; }
    await api.deleteResume(id);
  },
};
