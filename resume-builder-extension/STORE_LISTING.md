# Chrome Web Store — publishing runbook (R-033)

Status: code complete (tests green). Auth handshake IMPLEMENTED (R-093) —
no remaining pre-submission blockers.

## Auth handshake — DONE (R-093)

The paste-your-JWT flow is no longer required. The extension now connects
via a safe, publish-friendly handshake (no extension ID / externally_connectable
needed):

1. Web: `/extension/connect` page. A logged-in user clicks "Connect my
   extension"; the page hands the current access token to the extension's
   `content/connect.js` content script via `window.postMessage`
   (same-origin, verified) plus a `data-callbackcv-token` hidden-div
   fallback. The token is exposed ONLY on that explicit click.
2. Extension: `content/connect.js` (matched only on the CallbackCV connect
   URLs) verifies `event.origin` + `data.source === 'callbackcv-connect'`
   and stores `{ accessToken, apiBase }` in `chrome.storage.local`.
3. Options page now leads with "Open the Connect page"; the manual
   token/API-base fields remain under a "power users" disclosure.

## Autofill — INCLUDED

The extension now injects an "Autofill with CallbackCV" button on ATS
application pages (Greenhouse, Lever, Workable, SmartRecruiters, Ashby,
Workday). On click it fetches the user's autofill profile
(`GET /me/autofill-profile`, via the background worker) and fills only
EMPTY fields using label/name/id/aria/autocomplete heuristics
(`content/field-map.js`, unit-tested). It never auto-submits, never
clobbers user input, and never touches password/file/hidden inputs.
Declare this in the store privacy tab as an additional single-purpose
feature ("fill job application forms with the user's own profile data").

## Founder steps to publish (once auth lands)

1. Create a Chrome Web Store developer account:
   https://chrome.google.com/webstore/devconsole — one-time $5 fee,
   use the company Google account.
2. `cd resume-builder-extension && zip -r ../callbackcv-extension.zip . -x "tests/*" "*.md"`
3. Dev console → New item → upload the zip.
4. Listing content (draft):
   - Name: **CallbackCV — Job Hunt Companion**
   - Summary: One-click job saving and apply-tracking. Captures the JD and
     asks which resume version you used, so your Outcome Loop fills itself.
   - Category: Productivity → Tools. Language: English (India available).
   - Screenshots needed: popup on a job page; the "which version?" prompt;
     the tracker showing the saved job. 1280×800 PNG, min 1.
   - Privacy tab: declare storage + activeTab + scripting + contextMenus;
     single purpose = "track job applications the user explicitly saves";
     data use = auth token stored locally, job data sent only to the
     user's own CallbackCV account. No sale of data.
5. Privacy policy URL: https://ats-rb-web.onrender.com/privacy (must
   mention the extension).
6. Submit for review — typical review time 1–3 business days.

## Post-publish
- Add the store link to the web app (dashboard + /jobs page).
- Bump `manifest.json` version on every future upload.
