#!/bin/sh
# Render cron entrypoint (R-088). Calls one CallbackCV cron endpoint with the
# shared secret. All config comes from env vars — NO dockerCommand quoting,
# which Render's exec-style argv parsing mangled ("sh: curl ...: not found",
# exit 127; see the Jul 19 failed runs).
#
# Required env:
#   CRON_TARGET_URL  e.g. https://ats-rb-api.onrender.com/outcome-nudge/run
#   CRON_SECRET      same value as on the ats-rb-api service
set -u

fail() { echo "FAIL: $1"; exit 1; }

[ -n "${CRON_TARGET_URL:-}" ] || fail "CRON_TARGET_URL env var is not set on this cron service."
[ -n "${CRON_SECRET:-}" ] || fail "CRON_SECRET env var is not set on THIS cron service. Set it to the same value as on ats-rb-api."

echo "POST ${CRON_TARGET_URL}"
status=$(curl -sS -o /tmp/cron-body.txt -w "%{http_code}" -m 120 --retry 2 --retry-delay 5 \
  -X POST -H "x-cron-secret: ${CRON_SECRET}" "${CRON_TARGET_URL}") || fail "curl could not reach the API (network/DNS). See error above."

echo "HTTP ${status}"
cat /tmp/cron-body.txt 2>/dev/null
echo ""

case "${status}" in
  2*) echo "-- cron run OK"; exit 0 ;;
  403) fail "API rejected the secret (403). CRON_SECRET here does not match the one on ats-rb-api (or it is unset there — check GET /admin/jobs/status: cronSecretConfigured)." ;;
  *) fail "API returned HTTP ${status}." ;;
esac
