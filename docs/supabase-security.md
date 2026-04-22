# Supabase security & backups — operational playbook

This document answers the question "how do I keep user data safe on Supabase
once real users start using the app, and do I need the paid plan for
backups?" It is *advisory*. Nothing in this document is automatically
enforced by the codebase — you must apply the SQL and the dashboard settings
in your Supabase project.

## 1. Do I need the paid Supabase plan?

Yes, for anything beyond a personal demo. Here is what each tier actually
gives you that matters for user trust:

| Feature | Free | Pro ($25/mo) | Team ($599/mo) |
| --- | --- | --- | --- |
| Daily backups (7-day retention) | — | ✅ | ✅ (14 days) |
| Point-in-time recovery (PITR) | — | add-on $100/mo | add-on |
| Project pauses after 1 week inactivity | yes | no | no |
| Log retention | 1 day | 7 days | 28 days |
| Compute / connection pooler limits | tiny | production-grade | production-grade |
| SOC 2 report | — | on request | ✅ |

**Recommendation:**

- Day 1 in production: move to **Supabase Pro**. The 7-day automated backups
  alone cost less than one lost customer. Auto-pause on Free is a hard
  incident risk — a dormant project can refuse logins until you manually
  resume it.
- Once you cross ~500 paying users or are handling PII beyond names and
  resume content: **add PITR**. It lets you rewind the database to any
  second within the last 7 days, which is the only thing that actually
  saves you from a bad migration, a bulk-delete bug, or a ransomware
  event.
- Do **not** rely on `pg_dump` from your laptop as a backup strategy.
  Automated, off-site, tested backups are the only kind that count.

## 2. Row Level Security (RLS)

The app accesses Postgres via Prisma using the `service_role` key, which
**bypasses RLS**. That is fine as long as the service_role credential never
leaks outside the API. It is **not** fine if anyone ever connects from the
browser using the `anon` key.

Even though we don't currently use supabase-js from the client, enable RLS
as a defense-in-depth measure so an accidental future use of the anon key
(e.g. a junior dev imports `@supabase/supabase-js` to build a quick
feature) doesn't expose everything.

Apply this once:

```sql
ALTER TABLE "User"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resume"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentHistory"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoginEvent"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OtpChallenge"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailOtpChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiTokenUsage"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiCritiqueLog"    ENABLE ROW LEVEL SECURITY;

-- No user-facing policies are created. All access goes through the API
-- using the service_role key, which bypasses RLS. Direct anon access is
-- denied by default.
```

If you later want a table to be readable from the browser directly (say a
public templates catalogue), add a narrow policy only for that table.

## 3. Secrets management

- Never commit the `service_role` or `anon` keys, SMTP password, Razorpay
  secret, Stripe secret, or JWT secret. Use Render / Railway / Fly
  environment variables or a secret manager (Doppler, AWS Secrets
  Manager, 1Password CLI).
- Rotate the JWT secret if you suspect token compromise. Active sessions
  will invalidate — that's the point.
- Scope the `service_role` key to the API service only. It must never end
  up in a `NEXT_PUBLIC_*` variable.

## 4. Data retention & minimization

- `LoginEvent` rows grow linearly with usage. After 6 months they are
  mostly useless for debugging and increasingly sensitive (IP + device
  fingerprint for every login). Schedule a monthly cleanup:

  ```sql
  DELETE FROM "LoginEvent" WHERE "createdAt" < NOW() - INTERVAL '180 days';
  ```

- `EmailOtpChallenge` and `OtpChallenge` should be purged aggressively.
  Rows older than 24 hours are garbage:

  ```sql
  DELETE FROM "EmailOtpChallenge" WHERE "createdAt" < NOW() - INTERVAL '1 day';
  DELETE FROM "OtpChallenge"      WHERE "createdAt" < NOW() - INTERVAL '1 day';
  ```

- `PaymentHistory` must be retained for 7 years for tax compliance in
  India. Do **not** delete it.

You can schedule these via Supabase's built-in `pg_cron` extension.

## 5. Network / access

- Enable Supabase's Database Network Restrictions to allow connections
  only from your deployed API's egress CIDR + developer IPs.
- Turn on "Enforce SSL" on the database — prevents downgrade attacks.
- Require 2FA for every human who has dashboard access.

## 6. PII column hygiene

The only sensitive PII stored today is `mobile` (E.164), `passwordHash`
(bcrypt, already safe), and `LoginEvent.ip`. If you want belt-and-braces
encryption of mobile numbers at rest, use Supabase's `pgsodium` extension
or move mobile hashing to a separate column (`mobileHash` for lookup +
`mobileEncrypted` for display).

## 7. Disaster recovery drill

Once a quarter:

1. Create a scratch Supabase project.
2. Restore the latest nightly backup into it.
3. Run a full `npm run test` against the restored DB.
4. Confirm you can still log in using an existing user's credentials.

Backups you have never restored do not work.

## 8. Incident playbook

When something goes wrong:

1. Rotate the service_role key.
2. Rotate the JWT secret.
3. Force-revoke all refresh tokens:
   ```sql
   UPDATE "User" SET "refreshTokenHash" = NULL, "refreshTokenExpiresAt" = NULL;
   ```
4. Email the affected users within 72 hours (GDPR / DPDP Act, India).
5. Write the incident up publicly once the fix is shipped.
