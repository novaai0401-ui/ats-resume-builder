const apiBase = document.getElementById('apiBase');
const token = document.getElementById('accessToken');
const status = document.getElementById('status');

chrome.storage.local.get(['apiBase', 'accessToken'], (cur) => {
  apiBase.value = cur.apiBase || 'http://localhost:4001';
  token.value = cur.accessToken || '';
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
