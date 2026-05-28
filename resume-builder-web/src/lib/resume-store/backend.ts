/**
 * Local-first resume store — backend interface.
 *
 * Storage is swappable so the same `ResumeStore` works against IndexedDB
 * in the browser, an in-memory map in tests, and (later) SQLite in the
 * React Native app. Backends own ONLY persistence — no validation, no
 * shape decisions — so swapping them never changes behavior.
 *
 * Keys are stable resume IDs (cuid-like). Values are opaque records that
 * the store layer shapes; backends serialize/deserialize as JSON.
 */

export interface StoredRecord {
  id: string;
  /** Free-form payload — the store decides what goes here. */
  payload: unknown;
  /** ISO timestamp set by the store on every write. */
  updatedAt: string;
  /** Monotonically increasing per-record. Used for conflict detection. */
  version: number;
}

export interface ResumeStoreBackend {
  /** Open / connect / initialize. Idempotent. */
  open(): Promise<void>;

  get(storeName: string, id: string): Promise<StoredRecord | null>;
  put(storeName: string, record: StoredRecord): Promise<void>;
  delete(storeName: string, id: string): Promise<void>;
  list(storeName: string): Promise<StoredRecord[]>;

  /** Hard-clear everything in a store. Used for opt-out / right-to-be-forgotten. */
  clear(storeName: string): Promise<void>;

  /** Backend identity, for diagnostics. */
  readonly name: string;
}

export const RESUMES_STORE = 'resumes';
export const VERSIONS_STORE = 'resume-versions';
export const META_STORE = 'meta';
