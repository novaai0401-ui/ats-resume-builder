import { openingToApplicationPayload } from './lib/jobs-util.js';
import { webOrigin } from './lib/api.js';

const thread = document.getElementById('thread');
const msg = document.getElementById('msg');
const send = document.getElementById('send');
const composer = document.getElementById('composer');
const notConfigured = document.getElementById('not-configured');
const notOptedIn = document.getElementById('not-opted-in');

document.getElementById('open-options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
document.getElementById('open-options-2')?.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
document.getElementById('open-sahaayak')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const base = await webOrigin();
  chrome.tabs.create({ url: `${base}/sahaayak` });
});

init();

async function init() {
  const cfg = await sendMessage({ type: 'IS_CONFIGURED' });
  if (!cfg.ok || !cfg.configured) {
    notConfigured.hidden = false;
    return;
  }
  // Live openings work whenever the user is signed in — independent of the
  // Sahaayak opt-in gate below.
  setupOpenings();
  const profile = await sendMessage({ type: 'SAHAAYAK_PROFILE' });
  if (!profile.ok || !profile.data?.optedIn) {
    notOptedIn.hidden = false;
    return;
  }
  msg.disabled = false;
  send.disabled = false;
  appendBubble('assistant', `Hi. I'm here when you want to talk.`);
}

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = msg.value.trim();
  if (!text) return;
  appendBubble('user', text);
  msg.value = '';
  send.disabled = true;
  const resp = await sendMessage({ type: 'SAHAAYAK_CHAT', message: text });
  send.disabled = false;
  if (!resp.ok) {
    appendBubble('assistant', `(couldn't reach the server: ${resp.error || 'unknown'})`);
    return;
  }
  const isCrisis = resp.data?.crisis?.flag;
  appendBubble('assistant', resp.data?.reply || '(no reply)', isCrisis);
});

function appendBubble(role, content, isCrisis) {
  const div = document.createElement('div');
  div.className = 'bubble ' + role + (isCrisis ? ' crisis' : '');
  div.textContent = content;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp || { ok: false, error: 'no response' });
    });
  });
}

// ── Live openings ───────────────────────────────────────────────────
function setupOpenings() {
  const section = document.getElementById('openings');
  const qEl = document.getElementById('op-q');
  const locEl = document.getElementById('op-loc');
  const btn = document.getElementById('op-search');
  const results = document.getElementById('op-results');
  if (!section || !btn) return;
  section.hidden = false;

  async function search() {
    const q = qEl.value.trim();
    if (q.length < 2) { results.textContent = 'Enter a role or skill.'; return; }
    results.textContent = 'Searching…';
    const resp = await sendMessage({ type: 'LIVE_OPENINGS', q, location: locEl.value.trim() });
    results.innerHTML = '';
    if (!resp.ok) {
      results.textContent = /LIVE_JOBS_REQUIRES_PLAN/i.test(resp.error || '')
        ? 'Live openings are a Student/Pro feature.'
        : `Could not search: ${resp.error || 'unknown'}`;
      return;
    }
    const openings = resp.data?.openings || [];
    if (openings.length === 0) { results.textContent = 'No openings matched.'; return; }
    for (const job of openings) {
      results.appendChild(renderOpening(job));
    }
  }

  btn.addEventListener('click', search);
  qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  locEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
}

function renderOpening(job) {
  const row = document.createElement('div');
  row.className = 'op-item';

  const info = document.createElement('div');
  const link = document.createElement('a');
  link.href = job.url; link.target = '_blank'; link.rel = 'noreferrer';
  link.textContent = job.title; link.className = 'op-link';
  const meta = document.createElement('div');
  meta.className = 'op-meta';
  meta.textContent = [job.company, job.location, job.salaryText].filter(Boolean).join(' · ');
  info.appendChild(link); info.appendChild(meta);

  const track = document.createElement('button');
  track.textContent = '+ Track';
  track.className = 'op-track';
  track.addEventListener('click', async () => {
    track.disabled = true; track.textContent = 'Adding…';
    const resp = await sendMessage({ type: 'CREATE_APPLICATION', payload: openingToApplicationPayload(job) });
    track.textContent = resp.ok ? '✓ Tracked' : 'Failed';
  });

  row.appendChild(info);
  row.appendChild(track);
  return row;
}
