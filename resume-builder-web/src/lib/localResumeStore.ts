/**
 * Device-local resume store (web / PWA).
 *
 * Uses IndexedDB rather than localStorage because:
 *   • localStorage is synchronous and capped at 5–10 MB per origin —
 *     a few rich resumes will fit, but a power user with 30+ versions
 *     can hit the wall.
 *   • IndexedDB is the standard for structured client storage, supports
 *     transactions, and is origin-isolated by the browser exactly like
 *     localStorage.
 *   • The browser persists IndexedDB across tab reloads and PWA app
 *     launches; on iOS Safari we use `navigator.storage.persist()` to
 *     ask the OS not to evict it.
 *
 * The data never leaves the user's browser unless they opt into cloud
 * sync in Settings.
 */

import type { Resume } from './api';

const DB_NAME = 'pocket-resume';
const STORE = 'resumes';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => {
      // Best-effort: ask the browser not to evict our data under
      // storage pressure. Safari and Firefox respect this; Chrome
      // grants it silently if the user has interacted with the site.
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        navigator.storage.persist().catch(() => null);
      }
      resolve(req.result);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed.'));
  });
  return dbPromise;
}

function uid(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `local_${t}_${r}`;
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result: T;
    Promise.resolve(fn(store)).then((value) => { result = value; }).catch(reject);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const localResumeStore = {
  async list(): Promise<Resume[]> {
    return tx('readonly', async (store) => {
      const all = await reqToPromise(store.getAll());
      return (all as Resume[]).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    });
  },

  async get(id: string): Promise<Resume | null> {
    return tx('readonly', async (store) => {
      const r = await reqToPromise(store.get(id));
      return (r as Resume) ?? null;
    });
  },

  async create(data: Partial<Resume>): Promise<Resume> {
    const now = new Date().toISOString();
    // Build the local-resume shape. The shared `Resume` type carries a
    // `userId` (required on the server-side row) — for a device-local
    // resume there's no server-side identity to hang it off, so we use
    // an empty string. The cloud-sync upgrade path will populate it
    // when the user opts in.
    // `contact` and the optional list fields stay undefined when the
    // caller didn't provide them; setting `contact: {}` would violate
    // ContactInfo (which requires `fullName`), and undefined is the
    // semantically-correct value for "no contact info yet."
    const resume: Resume = {
      id: uid(),
      userId: '',
      title: data.title ?? 'Untitled Resume',
      summary: data.summary ?? '',
      skills: data.skills ?? [],
      templateId: data.templateId ?? 'classic',
      experience: data.experience ?? [],
      education: data.education ?? [],
      projects: data.projects,
      certifications: data.certifications,
      contact: data.contact,
      updatedAt: now,
      createdAt: now,
    };
    await tx('readwrite', async (store) => { await reqToPromise(store.add(resume)); });
    return resume;
  },

  async update(id: string, patch: Partial<Resume>): Promise<Resume> {
    return tx('readwrite', async (store) => {
      const existing = (await reqToPromise(store.get(id))) as Resume | undefined;
      if (!existing) throw new Error('Resume not found.');
      const updated: Resume = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
      await reqToPromise(store.put(updated));
      return updated;
    });
  },

  async delete(id: string): Promise<void> {
    await tx('readwrite', async (store) => { await reqToPromise(store.delete(id)); });
  },

  async exportAll(): Promise<Resume[]> {
    return this.list();
  },

  async importAll(resumes: Resume[]): Promise<void> {
    await tx('readwrite', async (store) => {
      for (const r of resumes) await reqToPromise(store.put(r));
    });
  },

  async clearAll(): Promise<void> {
    await tx('readwrite', async (store) => { await reqToPromise(store.clear()); });
  },
};
