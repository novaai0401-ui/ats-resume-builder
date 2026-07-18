# Chrome Web Store — publishing runbook (R-033)

Status: code complete (6/6 tests green), ONE blocker before store submission.

## The one blocker: auth polish

Today the options page asks the user to paste their JWT from DevTools
(`options.html` → "Paste your JWT here"). That is fine for internal use and
will fail Chrome review UX expectations (and the token expires in 7 days).

Required change before submitting (small, ~1 day):
1. API: `POST /auth/extension-token` (JWT-guarded) → issues a long-lived,
   scoped token (extension: read resume list, create job applications only).
2. Web: `/settings/extension` page with a "Connect extension" button that
   sends the token to the extension via `chrome.runtime.sendMessage`
   (externally_connectable) or a copy-once code.
3. Extension: replace the paste field with "Sign in via pocketresume.app".

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
