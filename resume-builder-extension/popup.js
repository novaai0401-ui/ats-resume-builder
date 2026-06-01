const thread = document.getElementById('thread');
const msg = document.getElementById('msg');
const send = document.getElementById('send');
const composer = document.getElementById('composer');
const notConfigured = document.getElementById('not-configured');
const notOptedIn = document.getElementById('not-opted-in');

document.getElementById('open-options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
document.getElementById('open-options-2')?.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
document.getElementById('open-sahaayak')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.storage.local.get(['apiBase'], ({ apiBase }) => {
    const base = (apiBase || 'http://localhost:4001').replace(/:4001$/, ':3000');
    chrome.tabs.create({ url: `${base}/sahaayak` });
  });
});

init();

async function init() {
  const cfg = await sendMessage({ type: 'IS_CONFIGURED' });
  if (!cfg.ok || !cfg.configured) {
    notConfigured.hidden = false;
    return;
  }
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
