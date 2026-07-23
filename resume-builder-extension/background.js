/**
 * Service worker — owns the context menu, dispatches messages between
 * content scripts and the popup, and proxies API calls so content
 * scripts don't have to carry the auth token in-page.
 */

import { api, isConfigured, webOrigin } from './lib/api.js';

const MENU_ID = 'callbackcv-send-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Send selection to CallbackCV (JD match)',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = String(info.selectionText || '').trim();
  if (!text) return;
  await chrome.storage.local.set({ pendingJd: { text, url: tab?.url || '', capturedAt: Date.now() } });
  // Open the web app /jd-match page with the captured JD primed.
  const webBase = await webOrigin();
  chrome.tabs.create({ url: `${webBase}/jd-match?source=extension` });
});

// Message channel for content scripts and popup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'IS_CONFIGURED':
          sendResponse({ ok: true, configured: await isConfigured() });
          break;
        case 'OPEN_APP': {
          // The content-script FAB's "Open CallbackCV" action.
          const webBase = await webOrigin();
          chrome.tabs.create({ url: `${webBase}/dashboard` });
          sendResponse({ ok: true });
          break;
        }
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
        case 'LIVE_OPENINGS':
          sendResponse({ ok: true, data: await api.liveOpenings(msg.q, msg.location) });
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
