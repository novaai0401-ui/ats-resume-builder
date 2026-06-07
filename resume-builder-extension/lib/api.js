/**
 * Minimal API client for the extension. Mirrors the patterns in
 * resume-builder-web/src/lib/api.ts but in plain ES modules so it
 * loads in service workers without bundling.
 */

const DEFAULT_BASE = 'http://localhost:4001';

async function getAuth() {
  const { apiBase, accessToken } = await chrome.storage.local.get(['apiBase', 'accessToken']);
  return { base: apiBase || DEFAULT_BASE, token: accessToken || '' };
}

async function request(path, options = {}) {
  const { base, token } = await getAuth();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`API ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listResumes: () => request('/resumes'),
  listResumeVersions: (resumeId) => request(`/resumes/${resumeId}/versions`),
  simulateAts: (resumeId) => request(`/resumes/${resumeId}/ats-simulate`),

  parseJd: (text) =>
    request('/ai/parse-jd', { method: 'POST', body: JSON.stringify({ text }) }),
  jdMatch: (resumeText, jdText) =>
    request('/ai/skill-gap', { method: 'POST', body: JSON.stringify({ resumeText, jdText }) }),

  recruiterSim: (resumeText, jdText, currentSkills = []) =>
    request('/ai/recruiter-sim', { method: 'POST', body: JSON.stringify({ resumeText, jdText, currentSkills }) }),
  getResumeOutcomes: (resumeId) => request(`/resumes/${resumeId}/outcomes`),
  liveOpenings: (q, location) =>
    request(`/ai/live-openings?q=${encodeURIComponent(q)}${location ? `&location=${encodeURIComponent(location)}` : ''}`),

  createJobApplication: (payload) =>
    request('/jobs', { method: 'POST', body: JSON.stringify(payload) }),

  sahaayakChat: (message) =>
    request('/sahaayak/chat', { method: 'POST', body: JSON.stringify({ message, region: 'IN' }) }),
  sahaayakProfile: () => request('/sahaayak/profile'),
};

export async function isConfigured() {
  const { token } = await getAuth();
  return Boolean(token);
}
