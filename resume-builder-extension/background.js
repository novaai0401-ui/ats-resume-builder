/**
 * Service worker — owns the context menu, dispatches messages between
 * content scripts and the popup, and proxies API calls so content
 * scripts don't have to carry the auth token in-page.
 */

import { api, isConfigured } from './lib/api.js';

const MENU_ID = 'ats-builder-send-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Send selection to ATS Builder (JD match)',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = String(info.selectionText || '').trim();
  if (!text) return;
  await chrome.storage.local.set({ pendingJd: { text, url: tab?.url || '', capturedAt: Date.now() } });
  // Open the web app /jd-match page with the captured JD primed.
  const { apiBase } = await chrome.storage.local.get(['apiBase']);
  const webBase = inferWebOrigin(apiBase);
  chrome.tabs.create({ url: `${webBase}/jd-match?source=extension` });
});

function inferWebOrigin(apiBase) {
  // In dev the API runs on :4001 and the web on :3000. In prod the web
  // origin is whatever the user configures in options.
  if (!apiBase) return 'http://localhost:3000';
  try {
    const url = new URL(apiBase);
    if (url.port === '4001') return `${url.protocol}//${url.hostname}:3000`;
    return url.origin;
  } catch {
    return 'http://localhost:3000';
  }
}

// Message channel for content scripts and popup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'IS_CONFIGURED':
          sendResponse({ ok: true, configured: await isConfigured() });
          break;
        case 'LIST_RESUMES':
          sendResponse({ ok: true, data: await api.listResumes() });
          break;
        case 'LIST_VERSIONS':
          sendResponse({ ok: true, data: await api.listResumeVersions(msg.resumeId) });
          break;
        case 'PARSE_JD':
          sendResponse({ ok: true, data: await api.parseJd(msg.text) });
          break;
        case 'JD_MATCH':
          sendResponse({ ok: true, data: await api.jdMatch(msg.resumeText, msg.jdText) });
          break;
        case 'SIMULATE_ATS':
          sendResponse({ ok: true, data: await api.simulateAts(msg.resumeId) });
          break;
        case 'RECRUITER_SIM':
          sendResponse({ ok: true, data: await api.recruiterSim(msg.resumeText, msg.jdText, msg.currentSkills) });
          break;
        case 'CREATE_APPLICATION':
          sendResponse({ ok: true, data: await api.createJobApplication(msg.payload) });
          break;
        case 'SAHAAYAK_CHAT':
          sendResponse({ ok: true, data: await api.sahaayakChat(msg.message) });
          break;
        case 'SAHAAYAK_PROFILE':
          sendResponse({ ok: true, data: await api.sahaayakProfile() });
          break;
        default:
          sendResponse({ ok: false, error: `unknown message type: ${msg?.type}` });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error), status: error?.status });
    }
  })();
  return true; // keep the channel open for async sendResponse
});
