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

## Step 2 — Zero-knowledge cryptographic core ✅

Following the product decision that user-managed backup files are too
fragile, we use **end-to-end encrypted cloud sync with zero-knowledge**.
The server holds only ciphertext; it cannot read resumes even with full
DB access. Recovery survives device loss, browser wipes, and Safari
ITP eviction.

### What was built

| File | Purpose |
| --- | --- |
| `src/lib/crypto/key-derivation.ts` | PBKDF2-SHA256 (600k iterations, OWASP 2024), non-extractable KEK output |
| `src/lib/crypto/aes-gcm.ts` | AES-GCM encrypt/decrypt for JSON + raw bytes, base64url wire format |
| `src/lib/crypto/wrapping.ts` | DEK wrap/unwrap via WebCrypto `wrapKey`/`unwrapKey` |
| `src/lib/crypto/recovery-code.ts` | 120-bit Crockford base32 recovery code; tolerant normalization (I→1, O→0, L→1, U→V, dashes / spaces) |
| `src/lib/crypto/index.ts` | High-level orchestration: `setupVault`, `unlockWithPassphrase`, `unlockWithRecoveryCode`, `rotatePassphrase`, `InvalidUnlockError` |
| `tests/crypto.test.ts` | 14 unit tests |

### Crypto choices

- **PBKDF2-SHA256, 600,000 iterations** (OWASP 2024 recommendation).
  Chosen over Argon2 because it is native to WebCrypto — no WASM, no
  bundle bloat, no audit surface. Swappable behind the module interface
  if the threat model changes.
- **AES-256-GCM** for both data encryption AND key wrapping.
- **Per-user salt** for passphrase KDF, plaintext on the server (only
  rainbow-table defense).
- **Separate salt** for recovery-code KDF so passphrase rotation does
  NOT invalidate the recovery code, and vice versa.
- **DEK is generated fresh per user**, wrapped twice — once under the
  passphrase-derived KEK, once under the recovery-code-derived KEK.
- **Recovery code: 120 bits** of entropy in 24 Crockford base32 chars.
  Brute-force-infeasible even before the PBKDF2 cost.
- **WebCrypto `unwrapKey` is authenticated** — tampering with the
  wrapped blob, the IV, or the salt all cause `OperationError`, which
  we surface as `InvalidUnlockError`.

### Vault shape the server stores

```ts
interface VaultPublic {
  schemaVersion: 1;
  kdfParams: { algo: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
  passphraseSalt: string;     // base64url
  recoverySalt: string;       // base64url
  passphraseWrap: { iv: string; ciphertext: string };
  recoveryWrap:   { iv: string; ciphertext: string };
}
```

That is the entire public-side material. None of it leaks plaintext.
The DEK never reaches the server in unwrapped form.

### Test results (14 / 14 pass)

Covers: round-trip via passphrase, wrong-passphrase rejection,
round-trip via recovery code (formatted and canonical forms),
wrong-recovery-code rejection, `rotatePassphrase` invalidates the
old passphrase but preserves the recovery code, **ciphertext tampering
is detected**, short-passphrase rejection, Crockford normalization,
recovery codes are unique across calls, two vaults with the same
passphrase yield independent DEKs.

### Product decisions locked in

| Decision | Choice |
| --- | --- |
| Encrypt titles too | **Yes.** Server cannot see "Senior Backend Engineer at Stripe". Dashboard decrypts client-side to render. |
| Lost both passphrase and recovery code | **Data is permanently unrecoverable.** Strict zero-knowledge. Documented loudly at setup. |
| Default behavior | **Encryption + cloud sync ON at signup.** No "basic users got hacked" failure mode. |

---

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
