import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEY = 'rb_auth';
let API_BASE = 'http://10.0.2.2:5000'; // Android emulator → localhost

export function setApiBase(url: string) {
  API_BASE = url;
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

async function getToken(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    const auth = JSON.parse(raw) as AuthData;
    return auth.accessToken || null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<AuthData>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (payload: { fullName: string; email: string; mobile: string; password?: string }) =>
    request<AuthData>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  logout: () => request('/auth/logout', { method: 'POST' }).catch(() => {}),

  // Resumes
  listResumes: () => request<Resume[]>('/resumes'),

  getResume: (id: string) => request<Resume>(`/resumes/${id}`),

  createResume: (data: Partial<Resume>) =>
    request<Resume>('/resumes', { method: 'POST', body: JSON.stringify(data) }),

  updateResume: (id: string, data: Partial<Resume>) =>
    request<Resume>(`/resumes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteResume: (id: string) =>
    request(`/resumes/${id}`, { method: 'DELETE' }),

  // ATS
  atsScore: (id: string, jdText?: string) =>
    request<AtsScoreResult>(`/resumes/${id}/ats-score`, { method: 'POST', body: JSON.stringify({ jdText }) }),

  // AI
  aiCritique: (input: Record<string, unknown>) =>
    request<Record<string, unknown>>('/ai/ai-critique', { method: 'POST', body: JSON.stringify(input) }),

  techGap: (input: Record<string, unknown>) =>
    request<Record<string, unknown>>('/ai/tech-gap', { method: 'POST', body: JSON.stringify(input) }),

  // Social providers
  getSocialProviders: () =>
    request<{ providers: Array<{ id: string; name: string; configured: boolean }> }>('/auth/social/providers'),
};
