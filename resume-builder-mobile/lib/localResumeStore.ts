/**
 * Device-local resume store (mobile).
 *
 * The privacy-first default for Pocket Resume. Resume content lives in
 * the device's app-sandboxed storage and never reaches our servers
 * unless the user explicitly opts into encrypted cloud backup.
 *
 * Why AsyncStorage and not SecureStore:
 *   • SecureStore on iOS uses the Keychain, which has a hard 2 KB-per-
 *     item limit. A resume with multiple work entries easily exceeds
 *     that.
 *   • AsyncStorage on iOS writes to the app sandbox, which is encrypted
 *     at rest if the user has a device passcode (the default since iOS 9).
 *   • AsyncStorage on Android uses EncryptedSharedPreferences on Android
 *     6+ when the project includes the encrypted-storage variant; in
 *     base form it's the app sandbox, which is itself disk-encrypted on
 *     every Android since ~5.0.
 *   • Web (react-native-web) maps it to localStorage, which is
 *     origin-isolated by the browser.
 *
 * If a user wants stronger protection (e.g. their phone has no
 * passcode), the SettingsScreen can enable a per-resume "vault
 * passphrase" that wraps an AES-GCM key — see encryptedBackup.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Resume } from './api';

const INDEX_KEY = 'rb_local_resume_index';
const RESUME_PREFIX = 'rb_local_resume:';

type IndexEntry = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
};

function uid(): string {
  // Local IDs are prefixed so we can tell at a glance whether an ID
  // came from the local store or from a legacy cloud-stored resume.
  // Sortable timestamp + 6 random base36 chars is collision-safe for a
  // single user across hundreds of resumes.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `local_${t}_${r}`;
}

async function readIndex(): Promise<IndexEntry[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as IndexEntry[]; } catch { return []; }
}

async function writeIndex(entries: IndexEntry[]) {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

export const localResumeStore = {
  /** Returns the resume index newest-first, sorted by updatedAt. */
  async list(): Promise<Resume[]> {
    const idx = await readIndex();
    const sorted = [...idx].sort((a, b) =>
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    );
    const resumes = await Promise.all(sorted.map((e) => this.get(e.id)));
    return resumes.filter((r): r is Resume => r !== null);
  },

  async get(id: string): Promise<Resume | null> {
    const raw = await AsyncStorage.getItem(`${RESUME_PREFIX}${id}`);
    if (!raw) return null;
    try { return JSON.parse(raw) as Resume; } catch { return null; }
  },

  async create(data: Partial<Resume>): Promise<Resume> {
    const now = new Date().toISOString();
    const resume: Resume = {
      id: uid(),
      title: data.title ?? 'Untitled Resume',
      summary: data.summary ?? '',
      skills: data.skills ?? [],
      templateId: data.templateId ?? 'classic',
      experience: data.experience ?? [],
      education: data.education ?? [],
      projects: data.projects ?? [],
      certifications: data.certifications ?? [],
      contact: data.contact ?? {},
      updatedAt: now,
      createdAt: now,
    };
    await AsyncStorage.setItem(`${RESUME_PREFIX}${resume.id}`, JSON.stringify(resume));
    const idx = await readIndex();
    idx.push({ id: resume.id, title: resume.title, updatedAt: now, createdAt: now });
    await writeIndex(idx);
    return resume;
  },

  async update(id: string, patch: Partial<Resume>): Promise<Resume> {
    const existing = await this.get(id);
    if (!existing) throw new Error('Resume not found.');
    const now = new Date().toISOString();
    const updated: Resume = { ...existing, ...patch, id, updatedAt: now };
    await AsyncStorage.setItem(`${RESUME_PREFIX}${id}`, JSON.stringify(updated));
    const idx = await readIndex();
    const entry = idx.find((e) => e.id === id);
    if (entry) {
      entry.title = updated.title;
      entry.updatedAt = now;
      await writeIndex(idx);
    }
    return updated;
  },

  async delete(id: string): Promise<void> {
    await AsyncStorage.removeItem(`${RESUME_PREFIX}${id}`);
    const idx = await readIndex();
    await writeIndex(idx.filter((e) => e.id !== id));
  },

  /** Used by the (future) encrypted-backup flow to take a snapshot. */
  async exportAll(): Promise<Resume[]> {
    return this.list();
  },

  /** Used by encrypted-backup restore on a new device. */
  async importAll(resumes: Resume[]): Promise<void> {
    const idx: IndexEntry[] = [];
    for (const r of resumes) {
      await AsyncStorage.setItem(`${RESUME_PREFIX}${r.id}`, JSON.stringify(r));
      idx.push({ id: r.id, title: r.title, updatedAt: r.updatedAt, createdAt: r.createdAt });
    }
    await writeIndex(idx);
  },

  /** Hard reset, e.g. on logout. The user can opt into "keep local data on logout" later. */
  async clearAll(): Promise<void> {
    const idx = await readIndex();
    await Promise.all(idx.map((e) => AsyncStorage.removeItem(`${RESUME_PREFIX}${e.id}`)));
    await AsyncStorage.removeItem(INDEX_KEY);
  },
};
