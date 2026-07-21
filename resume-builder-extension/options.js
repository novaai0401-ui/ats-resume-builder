const apiBase = document.getElementById('apiBase');
const token = document.getElementById('accessToken');
const status = document.getElementById('status');

const connectedState = document.getElementById('connected-state');

chrome.storage.local.get(['apiBase', 'accessToken'], (cur) => {
  apiBase.value = cur.apiBase || 'http://localhost:4001';
  token.value = cur.accessToken || '';
  if (connectedState) {
    connectedState.textContent = cur.accessToken ? 'Connected ✓' : 'Not connected yet.';
  }
});

// Infer the web origin from the configured API base and open /extension/connect.
function webOriginFromApiBase(base) {
  const b = (base || 'http://localhost:4001').replace(/\/+$/, '');
  try {
    const url = new URL(b);
    if (url.hostname === 'localhost' && url.port === '4001') return 'http://localhost:4000';
    if (url.hostname.includes('ats-rb-api')) return b.replace('ats-rb-api', 'ats-rb-web');
    return url.origin;
  } catch {
    return 'http://localhost:4000';
  }
}

document.getElementById('open-connect')?.addEventListener('click', () => {
  chrome.storage.local.get(['apiBase'], ({ apiBase: base }) => {
    chrome.tabs.create({ url: `${webOriginFromApiBase(base)}/extension/connect` });
  });
});

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.local.set(
    { apiBase: apiBase.value.trim().replace(/\/+$/, ''), accessToken: token.value.trim() },
    () => {
      status.textContent = 'Saved.';
      setTimeout(() => { status.textContent = ''; }, 2000);
    },
  );
});
