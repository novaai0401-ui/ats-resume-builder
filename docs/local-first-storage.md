# Phase 7 — Local-first storage

A privacy-driven refactor: the resume content lives on the user's device,
not in Postgres. This is the design and the in-progress implementation.

## What's built so far (Step 1 — Foundation)

| File | Purpose |
| --- | --- |
| `src/lib/resume-store/backend.ts` | `ResumeStoreBackend` interface + store-name constants |
| `src/lib/resume-store/memory-backend.ts` | In-memory backend for tests and SSR fallback |
| `src/lib/resume-store/indexeddb-backend.ts` | Browser IndexedDB backend, Promise-wrapped |
| `src/lib/resume-store/index.ts` | `ResumeStore` high-level API + `getResumeStore()` singleton factory |
| `src/lib/resume-store/migrate.ts` | One-time server → local pull, idempotent per browser+user |
| `src/components/LocalFirstMigrationBanner.tsx` | UX banner that explains and confirms the migration |
| `tests/resume-store.test.ts` | 9 unit tests against the in-memory backend |

## Guarantees

1. **Swappable backend.** The same `ResumeStore` runs against IndexedDB
   in the browser, in-memory in tests, and (later) SQLite in the React
   Native app. Backends own only persistence — no validation, no shape
   decisions.
2. **Ownership protection.** `assertOwner(userId)` stamps the first
   user's ID into the local `meta` store on first save. A second user
   logging in on the same browser profile hits `ResumeOwnerMismatchError`
   instead of silently reading the first user's data.
3. **Cascading delete.** `deleteResume` removes the resume and every
   `ResumeVersion` snapshot tied to it.
4. **Conflict policy on migration.** When pulling server data into the
   local store, an existing local copy NEVER gets overwritten. Server
   wins only on the empty-slot case.
5. **User-owned export/import.** `exportAll()` returns a versioned JSON
   bundle the user can save. `importAll(bundle)` restores it on a new
   device. This is the manual sync path until we implement opt-in
   encrypted cloud sync.
6. **Idempotent migration.** Migration sentinel is keyed by
   `userId` in `localStorage`. Re-running the migration is safe.

## Test results

```
$ npx tsx --test tests/resume-store.test.ts
# tests 9
# pass 9
# fail 0
```

Covered scenarios:
- `saveResume` stamps `updatedAt` and round-trips.
- `listResumes` returns most-recently-updated first.
- `deleteResume` cascades to version snapshots.
- `snapshot` → edit → `restoreVersion` round-trips.
- `assertOwner` blocks cross-account access in the same browser profile.
- `wipe` clears resumes, versions, and ownership stamp.
- `exportAll` / `importAll` round-trip.
- `importAll` rejects unsupported `schemaVersion`.
- `version` field bumps on every write (groundwork for conflict detection).

## What's NOT done yet — explicit work list

| Step | Status | Notes |
| --- | --- | --- |
| Foundation (this commit) | ✅ done | |
| Wire existing editor + list pages to read from the local store first | ⏳ next | Touch `/app/dashboard`, `/app/resume/start`, `/app/resume/[id]` |
| Wire ATS Simulator + AI Critique + Cover Letter to accept `resumeText` in request bodies | ⏳ next | Some endpoints already do; widen to all |
| Move `ats-simulator.ts` into a shared package so it runs client-side | ⏳ | Pure function, trivial relocation |
| Drop `contact`, `summary`, `experience`, `education`, `projects`, `certifications`, `skills` columns from the Postgres `Resume` table; keep `id`, `userId`, `title`, timestamps | ⏳ | Requires the migration banner to have completed for everyone first |
| Same for `ResumeVersion.snapshot` | ⏳ | |
| Resume upload flow: parse on server, return payload to client, never persist | ⏳ | PatternLearnerAgent capture is independent of persistence — unaffected |
| Mobile (React Native) backend implementation | ⏳ | Implement `ResumeStoreBackend` against SQLite/AsyncStorage |

## Why this does NOT break the agent loops

- **PatternLearnerAgent** captures redacted upload text + verification
  reports. It does not depend on the resume being persisted server-side
  afterward. No change.
- **Sahaayak** uses `SahaayakEvent` / `SahaayakMessage` — activity, not
  resume content. No change.
- **Outcome Loop** uses `JobApplication.resumeVersionId` as an opaque
  reference. The server never needs the resume body to compute response
  rates. The `ResumeVersion` row keeps its `id` + `resumeId` + timestamps
  as a stable target; the payload moves to the device.
- **ATS Simulator** is already a pure function with no DB calls. Moving
  it client-side eliminates one server round-trip.
- **AI Critique / Cover Letter / JD Match** need to accept `resumeText`
  in the request body. Some endpoints already do; widening this is
  mechanical.

## Operating the local store (developer notes)

```ts
import { getResumeStore } from '@/src/lib/resume-store';

const store = await getResumeStore();
await store.assertOwner(currentUserId);   // first call stamps ownership

const all = await store.listResumes();
await store.saveResume({ id, title, ... });
const v = await store.snapshotVersion(id, 'pre-rewrite');
await store.restoreVersion(v.id);

const bundle = await store.exportAll();   // user backup
await store.importAll(bundle);

await store.wipe();                       // right-to-be-forgotten
```

## Backup story

`exportAll()` returns a `LocalExportBundle` (schemaVersion: 1). A future
commit adds a "Backup" UI: download the bundle as `.career.json`, import
it from another device. This is intentionally low-tech — the user owns
the file. Cloud sync (Drive / Dropbox / iCloud) will be opt-in, with
client-side encryption before upload.
