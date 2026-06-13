import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { isHostAllowed, signRequest } from './security';

const AUTH_KEY = 'rb_auth';

// ── API Base URL ────────────────────────────────────────────────────
// Resolution order:
//   1. EXPO_PUBLIC_API_BASE env (build-time inline)
//   2. expo.extra.apiBase from app.json
//   3. setApiBase() at runtime (e.g. from a "Settings" screen)
//   4. Fallback to Android emulator localhost mapping
const envBase =
  process.env.EXPO_PUBLIC_API_BASE ||
  (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase ||
  'http://10.0.2.2:4001';

let API_BASE = envBase;

export function getApiBase(): string {
  return API_BASE;
}

export function setApiBase(url: string) {
  API_BASE = url.replace(/\/+$/, '');
}

// ── Secure auth storage ─────────────────────────────────────────────
// SecureStore is available on iOS/Android; on web it falls back to
// AsyncStorage (which is localStorage under the hood for react-native-web).
const isWeb = Platform.OS === 'web';

async function storeSet(key: string, value: string) {
  if (isWeb) return AsyncStorage.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

async function storeGet(key: string): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function storeDelete(key: string) {
  if (isWeb) return AsyncStorage.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}

export type AuthData = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; isAdmin?: boolean };
  expiresAt?: string;
};

export type Resume = {
  id: string;
  title: string;
  summary: string;
  skills: string[];
  templateId?: string;
  experience: Array<{ company: string; role: string; startDate: string; endDate: string; highlights: string[] }>;
  education: Array<{ institution: string; degree: string; startDate: string; endDate: string; details?: string[] }>;
  projects?: Array<{ name: string; role?: string; highlights: string[] }>;
  certifications?: Array<{ name: string; issuer?: string; date?: string }>;
  contact?: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
};

export type AtsScoreResult = {
  atsScore: number;
  roleLevel: string;
  roleAdjustedScore: number;
  rejectionReasons: string[];
  improvementSuggestions: string[];
  missingKeywords: string[];
  guidance?: {
    roleAlignmentSummary: string;
    matchedKeywords: string[];
    missingKeywords: string[];
    weakSignals: string[];
    sectionSuggestions: { summary: string[]; experience: string[]; skills: string[] };
    addOnlyIfTrue: string[];
    topImpactActions: string[];
    scoreExplanation: string;
  };
};

export type RecruiterSimResult = {
  verdict: 'advance' | 'maybe' | 'reject';
  score: number;
  recruiterNote: string;
  strengths: string[];
  concerns: string[];
  missingMustHaves: string[];
  provider: 'groq' | 'rule-based';
};

export type OutcomeReport = {
  overall: {
    applied: number;
    responses: number;
    interviews: number;
    offers: number;
    callbackRate: number;
    interviewRate: number;
    offerRate: number;
    significant: boolean;
  };
  unattributed: number;
};

export async function loadAuth(): Promise<AuthData | null> {
  const raw = await storeGet(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthData;
  } catch {
    return null;
  }
}

export async function saveAuth(auth: AuthData): Promise<void> {
  await storeSet(AUTH_KEY, JSON.stringify(auth));
}

export async function clearAuth(): Promise<void> {
  await storeDelete(AUTH_KEY);
}

async function getAccessToken(): Promise<string | null> {
  const auth = await loadAuth();
  return auth?.accessToken ?? null;
}

// ── Refresh-token rotation ──────────────────────────────────────────
// On 401, we attempt one refresh then replay the request. Concurrent
// requests share the same refresh promise so we never hit the API twice.
let refreshInFlight: Promise<AuthData | null> | null = null;

async function refreshTokens(): Promise<AuthData | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const auth = await loadAuth();
    if (!auth?.refreshToken) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Partial<AuthData>;
      const merged: AuthData = {
        accessToken: data.accessToken ?? auth.accessToken,
        refreshToken: data.refreshToken ?? auth.refreshToken,
        user: data.user ?? auth.user,
        expiresAt: data.expiresAt ?? auth.expiresAt,
      };
      await saveAuth(merged);
      return merged;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const fullUrl = `${API_BASE}${path}`;
  if (!isHostAllowed(fullUrl)) {
    throw new Error('Refusing to call non-allowlisted host. Check Settings → API endpoint.');
  }

  const token = await getAccessToken();
  const method = (options.method || 'GET').toUpperCase();
  const body = typeof options.body === 'string' ? options.body : '';

  // Optional: HMAC the request so a stolen JWT alone can't be replayed
  // with a forged body. Server validates `X-Request-Signature` and
  // rejects timestamps older than 60s. Disabled if no signing key
  // configured (so dev with no shared secret keeps working).
  const sig = await signRequest(method, path, body);

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Platform': Platform.OS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sig ? { 'X-Request-Signature': sig.signature, 'X-Request-Timestamp': sig.timestamp } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && !retried) {
    const refreshed = await refreshTokens();
    if (refreshed) return request<T>(path, options, true);
    await clearAuth();
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
  }
  // 204 / empty body
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return undefined as unknown as T;
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<AuthData>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (payload: { fullName: string; email: string; mobile: string; password?: string }) =>
    request<AuthData>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  requestOtp: (email: string) =>
    request('/auth/request-otp', { method: 'POST', body: JSON.stringify({ email }) }),

  verifyOtp: (email: string, otp: string) =>
    request<AuthData>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),

  forgotPassword: (email: string) =>
    request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

  logout: () => request('/auth/logout', { method: 'POST' }).catch(() => {}),

  // Note: getSocialProviders was removed in the simplification pass.
  // We no longer offer Google / LinkedIn / Yahoo / GitHub login.

  // Resumes
  listResumes: () => request<Resume[]>('/resumes'),
  getResume: (id: string) => request<Resume>(`/resumes/${id}`),
  createResume: (data: Partial<Resume>) =>
    request<Resume>('/resumes', { method: 'POST', body: JSON.stringify(data) }),
  updateResume: (id: string, data: Partial<Resume>) =>
    request<Resume>(`/resumes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteResume: (id: string) =>
    request(`/resumes/${id}`, { method: 'DELETE' }),

  // ATS / AI
  atsScore: (id: string, jdText?: string) =>
    request<AtsScoreResult>(`/resumes/${id}/ats-score`, { method: 'POST', body: JSON.stringify({ jdText }) }),

  // For local-mode resumes: send the content directly. Server processes
  // in memory and never persists the resume body.
  atsScoreContent: (resume: Resume, jdText?: string) =>
    request<AtsScoreResult>(`/resumes/ats-score-content`, {
      method: 'POST',
      body: JSON.stringify({ resume, jdText }),
    }),
  aiCritique: (input: Record<string, unknown>) =>
    request<Record<string, unknown>>('/ai/ai-critique', { method: 'POST', body: JSON.stringify(input) }),
  techGap: (input: Record<string, unknown>) =>
    request<Record<string, unknown>>('/ai/tech-gap', { method: 'POST', body: JSON.stringify(input) }),
  coverLetter: (input: { resumeId: string; jdText: string; tone?: string }) =>
    request<{ content: string }>('/ai/cover-letter', { method: 'POST', body: JSON.stringify(input) }),

  // Recruiter-AI Simulator — verdict + reasoning against a JD.
  recruiterSim: (input: { resumeText: string; jdText: string; currentSkills?: string[] }) =>
    request<RecruiterSimResult>('/ai/recruiter-sim', { method: 'POST', body: JSON.stringify(input) }),

  // Outcome Loop — callback rate + per-version stats for a resume.
  getResumeOutcomes: (resumeId: string) =>
    request<OutcomeReport>(`/resumes/${resumeId}/outcomes`),

  // Job tracker
  listJobs: () => request<Array<Record<string, unknown>>>('/jobs'),
  createJob: (data: Record<string, unknown>) =>
    request('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id: string, data: Record<string, unknown>) =>
    request(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
