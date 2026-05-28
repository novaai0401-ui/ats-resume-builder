/**
 * IndexedDB backend — browser-only persistence for the local-first
 * resume store.
 *
 * Design choices:
 *  - Single database (`atsbuilder-local`), one object store per concept
 *    (`resumes`, `resume-versions`, `meta`). Keep the schema flat so a
 *    version upgrade is mostly additive.
 *  - All operations are Promise-wrapped — no raw IDBRequest callbacks
 *    leak out of this file.
 *  - We DO NOT enable durability hints; the browser's default is fine
 *    for our threat model. A more aggressive `durability: 'strict'`
 *    would slow down writes for marginal benefit.
 *  - The backend never touches the user's resumes by content — it only
 *    moves opaque records in and out.
 */

import {
  META_STORE,
  RESUMES_STORE,
  VERSIONS_STORE,
  type ResumeStoreBackend,
  type StoredRecord,
} from './backend';

const DB_NAME = 'atsbuilder-local';
const DB_VERSION = 1;

const ALL_STORES = [RESUMES_STORE, VERSIONS_STORE, META_STORE];

export class IndexedDBBackend implements ResumeStoreBackend {
  readonly name = 'indexeddb';
  private dbPromise: Promise<IDBDatabase> | null = null;

  async open(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this environment.');
    }
    if (!this.dbPromise) {
      this.dbPromise = this.openInternal();
    }
    await this.dbPromise;
  }

  async get(storeName: string, id: string): Promise<StoredRecord | null> {
    const db = await this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve((req.result as StoredRecord | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName: string, record: StoredRecord): Promise<void> {
    const db = await this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    const db = await this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async list(storeName: string): Promise<StoredRecord[]> {
    const db = await this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as StoredRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    const db = await this.requireDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async requireDb(): Promise<IDBDatabase> {
    await this.open();
    return this.dbPromise!;
  }

  private openInternal(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ALL_STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(new Error('IndexedDB open blocked — another tab may be holding an older version.'));
    });
  }
}
