/**
 * In-memory backend — for tests, SSR, and graceful degradation when the
 * browser refuses IndexedDB (e.g. Firefox private mode pre-115).
 *
 * The state is process-local. In SSR this means each request gets a
 * fresh store, which is the correct behavior — server should never
 * persist resume payloads under the local-first policy.
 */

import type { ResumeStoreBackend, StoredRecord } from './backend';

export class MemoryBackend implements ResumeStoreBackend {
  readonly name = 'memory';
  private readonly tables = new Map<string, Map<string, StoredRecord>>();

  async open(): Promise<void> {
    // no-op
  }

  async get(storeName: string, id: string): Promise<StoredRecord | null> {
    return this.table(storeName).get(id) ?? null;
  }

  async put(storeName: string, record: StoredRecord): Promise<void> {
    this.table(storeName).set(record.id, deepClone(record));
  }

  async delete(storeName: string, id: string): Promise<void> {
    this.table(storeName).delete(id);
  }

  async list(storeName: string): Promise<StoredRecord[]> {
    return [...this.table(storeName).values()].map(deepClone);
  }

  async clear(storeName: string): Promise<void> {
    this.tables.delete(storeName);
  }

  private table(name: string): Map<string, StoredRecord> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
