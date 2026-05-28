# ATS Builder — Browser Extension

A Manifest V3 extension that closes the loop between job-hunt browsing and
the ATS Builder app. Three things it does that nobody else does together:

1. **Auto-attribute applications.** When you click apply on a job posting,
   the extension catches the click and asks which resume version you used.
   It then creates a `JobApplication` record with `resumeVersionId` set —
   so the Outcome Loop populates automatically without manual backfilling.

2. **Recruiter-view overlay.** One click on a job posting renders the ATS
   Simulator output against the JD you are looking at right now. Shows
   what would land in Workday/Greenhouse plus the parse risks.

3. **Sahaayak in the corner.** The emotional companion is reachable from
   the extension popup without leaving the job board. Sustained stress
   gets surfaced where it happens.

## Architecture

```
manifest.json          Manifest V3 entry
background.js          Service worker — auth, API calls, context menu
popup.html / .js       Action popup (Sahaayak chat, recent activity)
options.html / .js     Server URL, token, settings
content/
  job-board.js         Content script: JD capture + apply-button hook
  overlay.css          Styles for in-page overlay
lib/
  api.js               Shared fetch wrapper (mirrors web app pattern)
  storage.js           Persistent local prefs / auth cache
```

The extension talks to the same backend the web app uses
(`NEXT_PUBLIC_API_URL`, defaults to `http://localhost:4001`). Auth is
shared — paste your JWT into the options page once, the extension reuses
it from `chrome.storage.local`.

## Loading the extension (dev)

1. `chrome://extensions` → enable Developer mode.
2. "Load unpacked" → pick `resume-builder-extension/`.
3. Open the options page, paste your access token from the web app
   (DevTools → Application → Local Storage → `accessToken`).

## Build / package (later)

When ready for distribution: pack `resume-builder-extension/` into a
.crx with `chrome --pack-extension=resume-builder-extension`. For
production, publish through the Chrome Web Store.

## Permissions explained

- `storage` — caches the access token and user prefs.
- `activeTab` — read the JD on the page when the user explicitly clicks
  the extension.
- `scripting` — inject the overlay when requested.
- `contextMenus` — right-click "Send selection to ATS Builder".
- `host_permissions` — the job boards we add the apply-button hook to.

We do not request `<all_urls>` host_permissions in production — the wildcard
appears in `manifest.json` here only for local dev convenience and should
be tightened before publishing.
