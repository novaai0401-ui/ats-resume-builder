# Pocket Resume — Privacy Architecture

## Promise

Your resume content lives **on your device**, not on our servers. We
designed Pocket Resume so that even if our database were leaked
tomorrow, attackers would find email addresses and password hashes —
not a single resume.

## What lives where

```
┌──────────────────────────────────────────────┐
│  Server (Supabase Postgres free tier)        │
│  ───────────────────────────────────────     │
│   ✓  email                                   │
│   ✓  password hash (bcrypt cost 12)          │
│   ✓  refresh tokens (rotated on use)         │
│   ✓  OTP challenges (10-min TTL, deleted     │
│      after verify)                           │
│   ✓  billing (plan, credits, usage counters) │
│   ✗  NEVER: resume content                   │
│   ✗  NEVER: cover letters                    │
│   ✗  NEVER: pasted job descriptions          │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Device                                      │
│  ───────────────────────────────────────     │
│   Mobile: AsyncStorage (app sandbox; on iOS  │
│     encrypted at rest if device passcode is  │
│     set, on Android disk-encrypted since 5.0)│
│   Web/PWA: IndexedDB (browser origin-locked) │
│                                              │
│   Storage:                                   │
│   ✓  every resume (full content)             │
│   ✓  user's storage-mode preference          │
│   ✓  biometric-lock preference               │
│   ✓  JWT (in Keychain/Keystore via           │
│      expo-secure-store on mobile)            │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  AI features (in-flight, not stored)         │
│  ───────────────────────────────────────     │
│   POST /resumes/ats-score-content            │
│   POST /ai/cover-letter                      │
│   POST /ai/critique                          │
│   POST /ai/skill-gap                         │
│                                              │
│   The resume body is sent in the request,    │
│   processed in memory, scored/generated,     │
│   the response is sent back, the data is     │
│   discarded. No row is created. We do log    │
│   request *metadata* (userId, latency, AI    │
│   provider, success/failure) but not the     │
│   request body.                              │
└──────────────────────────────────────────────┘
```

## Storage modes

The user picks one in Settings → "Where do your resumes live?"

| Mode | Default? | Where resumes go | Cross-device sync |
| --- | --- | --- | --- |
| **This device only** | ✅ | IndexedDB (web) / AsyncStorage (mobile) | ❌ — export PDF if you want backup |
| **Cloud sync** | — | Resumes go through `/resumes` API to Postgres | ✅ — sign in anywhere, same data |

Switching from local to cloud uploads existing local resumes (one-time
push). Switching from cloud to local performs a one-time pull-down so
nothing is lost.

## Why default to local?

1. **Truthful privacy story.** "Your resume never leaves your device
   unless you flip a toggle" is something you can put on a marketing
   page and not lie.
2. **Database stays small.** The Supabase free tier (500 MB) holds
   ~500,000 users worth of auth data. With resumes, you'd hit the cap
   at ~5,000 users. By keeping resumes off-server, the free tier lasts
   for years.
3. **Lower attack surface.** A breach of our DB is embarrassing
   (emails leaked) but not catastrophic (no resumes, no addresses, no
   work history).
4. **Faster app.** No round-trip to load or save a resume. Editor saves
   are instant.
5. **Works offline.** The whole editing experience works on the train.

## Trade-offs & how we mitigate

| Concern | Mitigation |
| --- | --- |
| User loses phone → loses resumes | "Export to PDF" button is always one tap away. |
| User wants to edit on phone + laptop | Settings toggle → "Cloud sync." Encrypted-blob backup planned (see below). |
| User clears browser data | Same as any web app. We use `navigator.storage.persist()` to ask the browser not to evict. |
| Recruiter "can you send me your resume?" | PDF export from any device. The cloud-sync mode also enables share links. |

## Future: encrypted cloud backup (planned)

The next privacy iteration is **end-to-end encrypted** cloud sync — the
backup blob is encrypted with a key the server never sees, derived from
a passphrase the user sets. Server stores ciphertext only. We literally
cannot read it even if subpoenaed.

The shape:

```
1. User sets a vault passphrase in Settings.
2. Client derives a key with PBKDF2-HMAC-SHA256, 600k iterations.
3. On each save: client encrypts the resume with AES-256-GCM and POSTs
   the ciphertext + nonce to /backup/upload.
4. On a new device: user enters passphrase, client downloads the blob,
   decrypts in memory.
5. We never see the passphrase, the key, or the plaintext.
```

This is a v2 feature. The local-only path covers v1.

## Hosting decisions (Supabase / Neon / Render)

| Platform | Free tier | When to upgrade |
| --- | --- | --- |
| **Supabase** | 500 MB DB · 50k MAU · 5 GB bandwidth · 2 projects | Pro at $25/mo when you cross MAU or DB size |
| **Neon** | 0.5 GB · branching · autoscale | $19/mo when you cross storage |
| **Render Postgres** | 1 GB free (90-day expiry) | Skip — the 90-day rule is a footgun |

For Pocket Resume's auth-only data, **Supabase free** lasts effectively
forever. One auth row is ~1 KB; you'd need 500,000 users to fill it.

If you outgrow even the paid tier (good problem to have), the
migration path is straightforward — Postgres dump + restore to any
managed Postgres provider. Don't engineer for that day until it's
6 months out.

## What we tell users (for /privacy and the App Store listings)

> Your resume is yours. By default, Pocket Resume stores everything you
> create on the device you create it on — phone, tablet, or computer.
> We never see your resume content unless you opt into cloud sync.
> Even with cloud sync, your data is encrypted in transit (HTTPS) and
> at rest (Supabase / Postgres encryption). We never sell your data, we
> never train AI models on it, and we never share it with recruiters or
> third parties without you explicitly clicking a "share" button.

## Verification (what to test before launch)

```bash
# 1. Open the app, create a resume, then check the Postgres table.
psql "$DATABASE_URL" -c 'SELECT count(*) FROM "Resume";'
# Should be 0 in local mode.

# 2. Run an ATS score from the app.
psql "$DATABASE_URL" -c 'SELECT count(*) FROM "Resume";'
# Still 0. The /ats-score-content endpoint did not persist anything.

# 3. Inspect API logs.
render logs --service ats-rb-api | grep -i resume | head
# You should see metadata (userId, latency) but no resume content.

# 4. Switch to cloud mode in Settings, save a resume.
psql "$DATABASE_URL" -c 'SELECT count(*) FROM "Resume";'
# Now 1.

# 5. Switch back to local mode. The resume row stays (so the user
#    doesn't lose it on accidental toggle), but new edits are local.
```
