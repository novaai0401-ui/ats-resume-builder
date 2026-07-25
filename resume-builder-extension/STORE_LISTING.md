# Chrome Web Store — publishing runbook (R-033, R-096)

Status: **store-ready.** The prior blockers are resolved (see below). What
remains is only what requires your Google account: create the developer
account, take screenshots, upload the zip, submit.

## Resolved blockers (R-096)

- **Auth UX** — the options page no longer tells users to dig a JWT out of
  DevTools. The web app now has **Settings → API access → Copy token**
  (`ApiAccessCard`), and the options page + extension README point there. The
  token is the normal ~7-day access token; the copy states it expires and to
  paste a fresh one when it does. (A long-lived scoped extension token is a
  nice future improvement but is no longer required to submit.)
- **Icons** — real 16/48/128 PNGs added under `icons/` and declared in
  `manifest.json` (`icons` + `action.default_icon`).
- **Host permissions** — removed the broad `https://*/*` and the
  `http://localhost:4001/*` dev entry (the two most common review rejections).
  The extension now requests only the supported job boards + the CallbackCV
  API host `https://ats-rb-api.onrender.com/*`.
- **Privacy policy** — a real page now exists at
  `https://ats-rb-web.onrender.com/privacy` covering the web app AND the
  extension's data handling.
- **Branding** — `action.default_title` is now "CallbackCV" (was "ATS
  Builder"); default API base is the production HTTPS URL.

## Founder steps to publish

1. Create a Chrome Web Store developer account:
   https://chrome.google.com/webstore/devconsole — one-time $5 fee,
   use the company Google account.
2. Build the upload zip (excludes tests, docs, and npm metadata):
   `cd resume-builder-extension && zip -r ../callbackcv-extension.zip . -x "tests/*" "*.md" "package.json" "package-lock.json" "node_modules/*"`
3. Dev console → New item → upload the zip.
4. Listing content (draft):
   - Name: **CallbackCV — Job Hunt Companion**
   - Summary: One-click job saving and apply-tracking. Captures the JD and
     asks which resume version you used, so your Outcome Loop fills itself.
   - Category: Productivity → Tools. Language: English (India available).
   - Screenshots needed: popup on a job page; the "which version?" prompt;
     the tracker showing the saved job. 1280×800 PNG, min 1.
   - Privacy tab: declare storage + contextMenus;
     single purpose = "track job applications the user explicitly saves";
     data use = auth token stored locally, job data sent only to the
     user's own CallbackCV account. No sale of data.
5. Privacy policy URL: https://ats-rb-web.onrender.com/privacy (must
   mention the extension).
6. Submit for review — typical review time 1–3 business days.

## Post-publish
- Add the store link to the web app (dashboard + /jobs page).
- Bump `manifest.json` version on every future upload.
