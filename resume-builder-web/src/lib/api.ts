import type {
  AiCritiqueRequest,
  AiCritiqueResult,
  AtsScoreResult,
  CoverLetter,
  CoverLetterGenerateRequest,
  CoverLetterGenerateResponse,
  CoverLetterTone,
  DuplicateResumeResult,
  JdParseResult,
  JobApplication,
  JobApplicationInput,
  JobStats,
  JobStatus,
  Resume,
  ResumeCritiqueResult,
  ResumeImportResult,
  ResumeVersionSummary,
  SkillGapResult,
  User,
} from 'resume-builder-shared';
export type {
  AiCritiqueRequest,
  AiCritiqueResult,
  AtsScoreResult,
  CoverLetter,
  CoverLetterGenerateRequest,
  CoverLetterGenerateResponse,
  CoverLetterTone,
  DuplicateResumeResult,
  JdParseResult,
  JobApplication,
  JobApplicationInput,
  JobStats,
  JobStatus,
  Resume,
  ResumeCritiqueResult,
  ResumeImportResult,
  ResumeVersionSummary,
  SkillGapResult,
  User,
} from 'resume-builder-shared';

export type AuthResponse = { user: User; accessToken: string; refreshToken: string; expiresAt?: string };
/** @deprecated Email OTP is no longer used for auth. Use social login or password. */
export type EmailOtpRequestResponse = { ok: boolean; message: string };
export type RegisterResponse = AuthResponse;

export type TechGapRequest = {
  summary?: string;
  skills?: string[];
  experience?: Array<{ company: string; role: string; startDate: string; endDate: string; highlights: string[] }>;
  education?: Array<{ institution: string; degree: string }>;
  certifications?: Array<{ name: string }>;
  targetRole?: string;
  jdText?: string;
};

export type TechGapResult = {
  strongSkills: string[];
  missingCriticalSkills: string[];
  missingSecondarySkills: string[];
  leadershipGap: string[];
  architectureGap: string[];
  toolsGap: string[];
  addOnlyIfTrue: string[];
  resumeImprovementSuggestions: string[];
  learningRoadmap: Array<{ skill: string; priority: 'high' | 'medium' | 'low'; reason: string }>;
  estimatedRoleReadiness: { overall: string; technical: string; leadership: string; domain: string };
  roleAlignmentSummary: string;
};
export type UploadResumeResponse = ResumeImportResult & {
  text?: string;
  fileName?: string;
  signals?: {
    roleCount: number;
    distinctCompanyCount: number;
    rolesWithDateCount: number;
    roleCompanyPatternCount: number;
    estimatedTotalMonths: number;
  };
  debug?: {
    experienceSignals?: {
      roleCount: number;
      distinctCompanyCount: number;
      rolesWithDateCount: number;
      roleCompanyPatternCount: number;
      estimatedTotalMonths: number;
    };
    sectionHits?: Record<string, number>;
    dateMatches?: string[];
  };
  parsed?: ResumeImportResult;
};

type ResumePayload = {
  title: string;
  contact?: {
    fullName: string;
    email?: string;
    phone?: string;
    location?: string;
    links?: string[];
  };
  summary: string;
  skills: string[];
  technicalSkills?: string[];
  softSkills?: string[];
  languages?: string[];
  experience: {
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    highlights: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    startDate: string;
    endDate: string;
    details?: string[];
    gpa?: number | null;
    percentage?: number | null;
  }[];
  projects?: {
    name: string;
    role?: string;
    startDate?: string;
    endDate?: string;
    url?: string;
    highlights: string[];
  }[];
  certifications?: {
    name: string;
    issuer?: string;
    date?: string;
    details?: string[];
  }[];
  templateId?: string;
};

type ResumeUpdatePayload = Partial<ResumePayload>;

type RefreshPayload = { userId: string; refreshToken: string };
type IngestResumeResponse = {
  resume: Resume;
  mapped: ResumeImportResult;
  signals: {
    roleCount: number;
    distinctCompanyCount: number;
    rolesWithDateCount: number;
    roleCompanyPatternCount: number;
    estimatedTotalMonths: number;
  };
};

type CompanySuggestResponse = {
  query: string;
  suggestions: string[];
};

type MetaSuggestResponse = {
  items: string[];
};

export type AdminSettingsResponse = {
  flags: {
    resumeCreationRateLimitEnabled: boolean;
    paymentFeatureEnabled: boolean;
  };
  updatedAt: string | null;
  forcedDisabled: boolean;
};

export type FeatureFlagsResponse = {
  paymentFeatureEnabled: boolean;
};

export type ApiFieldError = {
  path: string;
  message: string;
  suggestions?: string[];
};

export type ApiErrorDetails = {
  status: number;
  code?: string;
  message: string;
  errors: string[];
  fields: ApiFieldError[];
  raw: unknown;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  errors: string[];
  fields: ApiFieldError[];
  raw: unknown;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = 'ApiRequestError';
    this.status = details.status;
    this.code = details.code;
    this.errors = details.errors;
    this.fields = details.fields;
    this.raw = details.raw;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
const AUTH_STATE_CHANGED_EVENT = 'auth-state-changed';
export const RESUME_CREATE_RATE_LIMIT_CODE = 'RESUME_CREATE_RATE_LIMITED';

const storageKeys = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  userId: 'userId',
  userEmail: 'userEmail',
  sessionExpiresAt: 'sessionExpiresAt',
  sessionLastActivityAt: 'sessionLastActivityAt',
};

export type DriveSessionResponse = {
  driveConsentAsked: boolean;
  googleConnected: boolean;
  sessionExpiresAt: string | null;
};

export type DriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
};

export type DriveFilesResponse = {
  files: DriveFileItem[];
};

export type DriveImportResponse = {
  persisted: false;
  file: {
    fileId: string;
    fileName: string;
    mimeType: string;
  };
  resume: ResumeImportResult;
};

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const REFRESH_GRACE_MS = 2 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 5_000;
let silentRefreshInFlight: Promise<AuthResponse | null> | null = null;
let sessionHeartbeatStarted = false;

export function getAccessToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(storageKeys.accessToken) || '';
}

function getRefreshToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(storageKeys.refreshToken) || '';
}

function getUserId() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(storageKeys.userId) || '';
}

export function getCurrentUserId() {
  return getUserId();
}

export function getCurrentUserEmail() {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(storageKeys.userEmail) || '';
  if (stored) return stored;
  const payload = decodeJwtPayload(getAccessToken());
  const email = typeof payload?.email === 'string' ? payload.email : '';
  if (email) {
    localStorage.setItem(storageKeys.userEmail, email);
  }
  return email;
}

export function getCurrentUserMobile() {
  if (typeof window === 'undefined') return '';
  const payload = decodeJwtPayload(getAccessToken());
  const mobile = typeof payload?.mobile === 'string' ? payload.mobile : '';
  return mobile;
}

export function isCurrentUserAdmin() {
  if (typeof window === 'undefined') return false;
  // Primary check: read isAdmin flag from JWT (set by backend based on ADMIN_EMAILS)
  const payload = decodeJwtPayload(getAccessToken());
  if (payload?.adm === true) return true;
  // Fallback: check localStorage flag set during social login handoff
  if (localStorage.getItem('rb_isAdmin') === 'true') return true;
  // Legacy fallback: check env vars (for backwards compatibility)
  const adminEmails = parseCsvSet(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  const email = getCurrentUserEmail().toLowerCase();
  if (email && adminEmails.has(email)) return true;
  return false;
}

/**
 * Read the user's bring-your-own-key Groq/XAI API key from local browser
 * storage. Returns empty string if not set or SSR. Never persisted server-side.
 */
/**
 * Make a string safe to use as a filename across iOS Safari, Chrome
 * Android, and Windows downloads. Strips characters that those OSes
 * choke on (slashes, colons, control chars), collapses whitespace to
 * dashes, lowercases everything, and trims to 64 chars so we never
 * trigger the Windows MAX_PATH limit when combined with the user's
 * Downloads folder. Returns '' when the input was empty/all-bad so the
 * caller can fall back to a default ID-based name.
 */
function slugifyFileName(input?: string | null): string {
  if (!input) return '';
  const cleaned = String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')         // strip diacritics
    .replace(/[^\w\s.-]/g, '')                // drop everything else
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return cleaned.slice(0, 64);
}

// BYOK (bring your own LLM key) was removed. Every paid user routes
// through the single shared GROQ key configured by the operator. See
// docs/subscription-mechanics.md.
//
// We deliberately do NOT auto-clean the legacy `rb_byok_ai_key` from
// localStorage; users who set one once shouldn't re-encounter it via
// any UI surface, but leaving the value untouched avoids surprising
// state mutations on existing browser sessions.

export function setAuthTokens(auth: AuthResponse) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKeys.accessToken, auth.accessToken);
  localStorage.setItem(storageKeys.refreshToken, auth.refreshToken);
  localStorage.setItem(storageKeys.userId, auth.user.id);
  localStorage.setItem(storageKeys.userEmail, auth.user.email);
  // Store isAdmin flag from auth response
  if ((auth.user as Record<string, unknown>).isAdmin) {
    localStorage.setItem('rb_isAdmin', 'true');
  } else {
    localStorage.removeItem('rb_isAdmin');
  }
  // Store plan for premium feature gating
  const plan = (auth as Record<string, unknown>).plan;
  if (typeof plan === 'string') {
    localStorage.setItem('rb_plan', plan);
  }
  persistSessionExpiry(auth);
  markSessionActivity(true);
  notifyAuthStateChanged();
}

export function clearAuthTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKeys.accessToken);
  localStorage.removeItem(storageKeys.refreshToken);
  localStorage.removeItem(storageKeys.userId);
  localStorage.removeItem(storageKeys.userEmail);
  localStorage.removeItem(storageKeys.sessionExpiresAt);
  localStorage.removeItem(storageKeys.sessionLastActivityAt);
  localStorage.removeItem('rb_isAdmin');
  localStorage.removeItem('rb_plan');
  try {
    window.sessionStorage.removeItem('resume-builder.active-resume-id.v1');
    window.sessionStorage.removeItem('dashboard.imported-resume.v1');
    window.sessionStorage.removeItem('dashboard.last-activity.v1');
    window.sessionStorage.removeItem('resume-builder.pending-upload.v1');
  } catch {
    // Ignore sessionStorage access issues in restricted environments.
  }
  notifyAuthStateChanged();
}

function notifyAuthStateChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const clean = String(token || '').trim();
  if (!clean) return null;
  const parts = clean.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = window.atob(padded);
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseExpiresAtMs(value?: string | null): number {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return 0;
  return ms;
}

function getAccessTokenExpiryMs(token?: string): number {
  const payload = decodeJwtPayload(token || getAccessToken());
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp) || exp <= 0) return 0;
  return exp * 1000;
}

function persistSessionExpiry(auth: AuthResponse) {
  if (typeof window === 'undefined') return;
  const expiresAtMs = parseExpiresAtMs(auth.expiresAt) || getAccessTokenExpiryMs(auth.accessToken);
  if (!expiresAtMs) return;
  localStorage.setItem(storageKeys.sessionExpiresAt, new Date(expiresAtMs).toISOString());
}

function getSessionExpiryMs(): number {
  if (typeof window === 'undefined') return 0;
  const fromStorage = parseExpiresAtMs(localStorage.getItem(storageKeys.sessionExpiresAt));
  if (fromStorage) return fromStorage;
  const fromToken = getAccessTokenExpiryMs();
  if (fromToken) {
    localStorage.setItem(storageKeys.sessionExpiresAt, new Date(fromToken).toISOString());
  }
  return fromToken;
}

function readIdleTimeoutMs() {
  const raw = String(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS || '').trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IDLE_TIMEOUT_MS;
  return Math.floor(parsed);
}

function markSessionActivity(force = false) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const current = Number(localStorage.getItem(storageKeys.sessionLastActivityAt) || '0');
  if (!force && current > 0 && now - current < ACTIVITY_WRITE_THROTTLE_MS) return;
  localStorage.setItem(storageKeys.sessionLastActivityAt, String(now));
}

function getLastSessionActivityMs() {
  if (typeof window === 'undefined') return 0;
  const value = Number(localStorage.getItem(storageKeys.sessionLastActivityAt) || '0');
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

async function refreshSilently(): Promise<AuthResponse | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = getRefreshToken();
  const userId = getUserId();
  if (!refreshToken || !userId) {
    clearAuthTokens();
    return null;
  }
  if (!silentRefreshInFlight) {
    silentRefreshInFlight = refresh({ userId, refreshToken }, { silent: true })
      .then((auth) => {
        setAuthTokens(auth);
        return auth;
      })
      .catch(() => {
        clearAuthTokens();
        return null;
      })
      .finally(() => {
        silentRefreshInFlight = null;
      });
  }
  return silentRefreshInFlight;
}

async function ensureSessionActive() {
  if (typeof window === 'undefined') return;
  if (!getAccessToken()) return;

  const idleTimeoutMs = readIdleTimeoutMs();
  const now = Date.now();
  const lastActivityMs = getLastSessionActivityMs();
  if (lastActivityMs > 0 && now - lastActivityMs >= idleTimeoutMs) {
    clearAuthTokens();
    return;
  }
  markSessionActivity(lastActivityMs <= 0);

  const expiryMs = getSessionExpiryMs();
  if (!expiryMs) return;
  if (expiryMs - now > REFRESH_GRACE_MS) return;

  await refreshSilently();
}

export function startSessionHeartbeat() {
  if (typeof window === 'undefined' || sessionHeartbeatStarted) return;
  sessionHeartbeatStarted = true;
  const onActivity = () => {
    markSessionActivity();
  };
  for (const eventName of ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown']) {
    window.addEventListener(eventName, onActivity, { passive: true });
  }
  markSessionActivity(true);
  void ensureSessionActive();
  // Ping server every 2 min so User.lastActiveAt stays current for the admin
  // dashboard's "active right now" metric. Fire-and-forget; failures silent.
  const pingNow = () => {
    if (!getAccessToken()) return;
    void fetch(`${baseUrl}/auth/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      keepalive: true,
    }).catch(() => undefined);
  };
  pingNow();
  window.setInterval(() => {
    void ensureSessionActive();
    pingNow();
  }, 120_000);
}

function parseCsvSet(raw?: string) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseMobileSet(raw?: string) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((item) => normalizeMobile(item))
      .filter(Boolean),
  );
}

function normalizeMobile(input?: string) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return `+${digits}`;
}

function isDev() {
  return process.env.NODE_ENV !== 'production';
}

type ApiErrorReadOptions = {
  log?: boolean;
};

async function readResponsePayload(res: Response): Promise<unknown> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) return null;

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const shouldParseJson = contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[');
  if (shouldParseJson) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function logApiError(res: Response, payload: unknown) {
  if (!isDev()) return;
  const details = {
    status: Number.isFinite(res.status) ? res.status : 0,
    url: res.url || '(unknown)',
    payload: payload ?? null,
  };
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[API Error]', details);
  }
}

async function readApiErrorDetails(
  res: Response,
  fallback: string,
  options: ApiErrorReadOptions = {},
): Promise<ApiErrorDetails> {
  const payload = await readResponsePayload(res);
  if (options.log !== false) {
    logApiError(res, payload);
  }

  const details: ApiErrorDetails = {
    status: res.status,
    code: undefined,
    message: fallback,
    errors: [],
    fields: [],
    raw: payload,
  };

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    details.message = trimmed || fallback;
    details.errors = details.message ? [details.message] : [];
    return details;
  }

  if (!payload || typeof payload !== 'object') {
    return details;
  }

  const anyPayload = payload as Record<string, unknown>;
  if (typeof anyPayload.code === 'string' && anyPayload.code.trim()) {
    details.code = anyPayload.code.trim();
  }

  if (Array.isArray(anyPayload.errors)) {
    const messages: string[] = [];
    const fields: ApiFieldError[] = [];
    for (const item of anyPayload.errors) {
      if (typeof item === 'string') {
        const clean = item.trim();
        if (clean) messages.push(clean);
        continue;
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const path = typeof obj.path === 'string' ? obj.path : '';
        const message = typeof obj.message === 'string' ? obj.message : '';
        if (path && message) {
          const suggestions = Array.isArray(obj.suggestions)
            ? obj.suggestions.map((entry) => String(entry || '').trim()).filter(Boolean)
            : undefined;
          fields.push({ path, message, suggestions: suggestions && suggestions.length ? suggestions : undefined });
          messages.push(`${path}: ${message}`);
          continue;
        }
        if (message) messages.push(message);
      }
    }
    details.errors = messages;
    details.fields = fields;
  }

  if (Array.isArray(anyPayload.fields)) {
    const fieldItems = (anyPayload.fields as unknown[])
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const path = typeof obj.path === 'string' ? obj.path.trim() : '';
        const message = typeof obj.message === 'string' ? obj.message.trim() : '';
        if (!path || !message) return null;
        const suggestions = Array.isArray(obj.suggestions)
          ? obj.suggestions.map((entry) => String(entry || '').trim()).filter(Boolean)
          : undefined;
        return { path, message, suggestions: suggestions && suggestions.length ? suggestions : undefined };
      })
      .filter(Boolean) as ApiFieldError[];
    if (fieldItems.length) {
      details.fields = fieldItems;
    }
  }

  if (typeof anyPayload.message === 'string' && anyPayload.message.trim()) {
    details.message = anyPayload.message.trim();
  } else if (Array.isArray(anyPayload.message)) {
    const messages = anyPayload.message.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    if (messages.length) details.message = messages.join(' ');
  } else if (typeof anyPayload.error === 'string' && anyPayload.error.trim()) {
    details.message = anyPayload.error.trim();
  } else if (details.errors.length) {
    details.message = details.errors.join(' ');
  }

  if (!details.errors.length && details.message) {
    details.errors = [details.message];
  }
  return details;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  await ensureSessionActive();

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
  });

  if (res.status === 401) {
    if (retry) {
      const refreshed = await refreshSilently();
      if (refreshed) {
        return request<T>(path, options, false);
      }
    } else if (getAccessToken()) {
      clearAuthTokens();
    }
  }

  if (!res.ok) throw new ApiRequestError(await readApiErrorDetails(res, 'Request failed'));
  return res.json() as Promise<T>;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  await ensureSessionActive();

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    body: formData,
    headers: {
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
  });

  if (res.status === 401) {
    const refreshed = await refreshSilently();
    if (refreshed) {
      return upload<T>(path, formData);
    } else if (getAccessToken()) {
      clearAuthTokens();
    }
  }

  if (!res.ok) throw new ApiRequestError(await readApiErrorDetails(res, 'Upload failed'));
  return res.json() as Promise<T>;
}

async function requestWithCredentials<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  await ensureSessionActive();

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshSilently();
    if (refreshed) {
      return requestWithCredentials<T>(path, options, false);
    }
  }

  if (!res.ok) throw new ApiRequestError(await readApiErrorDetails(res, 'Request failed'));
  return res.json() as Promise<T>;
}

export async function refresh(payload: RefreshPayload, options: { silent?: boolean } = {}): Promise<AuthResponse> {
  const res = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new ApiRequestError(await readApiErrorDetails(res, 'Refresh failed', { log: !options.silent }));
  return res.json() as Promise<AuthResponse>;
}

export const api = {
  register: async (payload: { fullName: string; email: string; mobile: string; password?: string }) => {
    const auth = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthTokens(auth);
    return auth;
  },

  logout: async () => {
    await request('/auth/logout', { method: 'POST' });
    clearAuthTokens();
  },

  getGoogleStartUrl: () =>
    requestWithCredentials<{ url: string }>('/auth/google/start', {
      method: 'GET',
    }),

  getDriveSession: () =>
    requestWithCredentials<DriveSessionResponse>('/drive/session', {
      method: 'GET',
    }),

  setDriveConsent: (payload: { decision: 'accepted' | 'declined' }) =>
    requestWithCredentials<DriveSessionResponse>('/drive/consent', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listDriveFiles: () =>
    requestWithCredentials<DriveFilesResponse>('/drive/files', {
      method: 'GET',
    }),

  importDriveFile: (fileId: string) =>
    requestWithCredentials<DriveImportResponse>('/drive/import', {
      method: 'POST',
      body: JSON.stringify({ fileId }),
    }),

  extendSession: async () => {
    const refreshToken = getRefreshToken();
    const userId = getUserId();
    if (!refreshToken || !userId) {
      throw new Error('No active session.');
    }
    const auth = await refresh({ userId, refreshToken }, { silent: true });
    setAuthTokens(auth);
    try {
      await requestWithCredentials<{ ok: boolean }>('/drive/session/extend', { method: 'POST' });
    } catch {
      // Ignore drive-session extension failures when primary auth extension succeeds.
    }
    return { ok: true };
  },

  getFeatureFlags: () => request<FeatureFlagsResponse>('/settings/public'),

  listResumes: () => request<Resume[]>('/resumes'),

  getResume: (id: string) => request<Resume>(`/resumes/${id}`),

  createResume: (payload: ResumePayload) =>
    request<Resume>('/resumes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateResume: (id: string, payload: ResumeUpdatePayload) =>
    request<Resume>(`/resumes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteResume: (id: string) => request(`/resumes/${id}`, { method: 'DELETE' }),

  duplicateResume: (id: string, title?: string) =>
    request<DuplicateResumeResult>(`/resumes/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  atsScore: (id: string, jdText?: string) =>
    request<AtsScoreResult>(`/resumes/${id}/ats-score`, {
      method: 'POST',
      body: JSON.stringify({ jdText }),
    }),

  uploadResume: (file: File) => {
    const data = new FormData();
    data.append('file', file);
    return upload<UploadResumeResponse>('/resumes/parse-upload', data);
  },

  ingestResume: (id: string, file: File) => {
    const data = new FormData();
    data.append('file', file);
    return upload<IngestResumeResponse>(`/resumes/${id}/ingest`, data);
  },

  recomputeResume: (id: string) =>
    request<{ resumeId: string; roleLevel: 'FRESHER' | 'MID' | 'SENIOR'; signals: Record<string, number> }>(`/resumes/${id}/recompute`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  companySuggest: (query: string) =>
    request<CompanySuggestResponse>(`/companies/suggest?q=${encodeURIComponent(query || '')}`),

  suggestInstitutions: (query: string, limit = 10) =>
    request<MetaSuggestResponse>(`/meta/suggest/institutions?q=${encodeURIComponent(query || '')}&limit=${encodeURIComponent(String(limit))}`),

  suggestSkills: (query: string, type: 'technical' | 'soft', limit = 10) =>
    request<MetaSuggestResponse>(`/meta/suggest/skills?q=${encodeURIComponent(query || '')}&type=${encodeURIComponent(type)}&limit=${encodeURIComponent(String(limit))}`),

  suggestCertifications: (query: string, limit = 10) =>
    request<MetaSuggestResponse>(`/meta/suggest/certifications?q=${encodeURIComponent(query || '')}&limit=${encodeURIComponent(String(limit))}`),

  parseJd: (text: string) =>
    request<JdParseResult>(`/ai/parse-jd`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  critique: (resumeText: string, jdText?: string) =>
    request<ResumeCritiqueResult>(`/ai/critique`, {
      method: 'POST',
      body: JSON.stringify({ resumeText, jdText }),
    }),

  skillGap: (resumeText: string, jdText: string) =>
    request<SkillGapResult>(`/ai/skill-gap`, {
      method: 'POST',
      body: JSON.stringify({ resumeText, jdText }),
    }),

  aiCritique: (input: AiCritiqueRequest) =>
    request<AiCritiqueResult>(`/ai/ai-critique`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  techGap: (input: TechGapRequest) =>
    request<TechGapResult>(`/ai/tech-gap`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /**
   * Per-bullet AI rewrite. Returns 3 alternative phrasings.
   * Server gates Free users (returns 403 FREE_PLAN_AI_BLOCKED) when
   * the payment feature is enabled. Falls back server-side to rule-
   * based variants when no LLM is configured — the response shape is
   * identical, so the caller doesn't have to branch.
   */
  rewriteBullet: (input: { currentBullet: string; role?: string; company?: string; jdText?: string }) =>
    request<{ alternatives: string[]; provider: 'groq' | 'rule-based'; tokensUsed: number }>(
      `/ai/rewrite-bullet`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  /**
   * JD Match Score. Returns matchPercent (0-100), matched/missing
   * keywords, and 3 bullet suggestions to close the gap. Plan-gated;
   * server falls back to rule-based output when LLM is unavailable.
   */
  jdMatch: (input: { resumeText: string; jdText: string; currentSkills?: string[] }) =>
    request<{
      matchPercent: number;
      matchedKeywords: string[];
      missingKeywords: string[];
      bulletSuggestions: string[];
      provider: 'groq' | 'rule-based';
    }>(`/ai/jd-match`, { method: 'POST', body: JSON.stringify(input) }),

  /** Interview Prep Cards — Pro only. */
  interviewPrep: (input: { resumeText: string; targetRole?: string; jdText?: string }) =>
    request<{
      questions: Array<{
        category: 'behavioral' | 'technical' | 'role-specific';
        question: string;
        whyAsked: string;
        answerOutline: string[];
      }>;
      provider: 'groq' | 'rule-based';
    }>(`/ai/interview-prep`, { method: 'POST', body: JSON.stringify(input) }),

  /** Mentor Chat — Pro only. Stateless; pass the full history each turn. */
  mentorChat: (input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    resumeText?: string;
    recentJobApplications?: Array<{ company: string; role: string; status: string }>;
  }) =>
    request<{ reply: string; provider: 'groq' | 'unavailable'; tokensUsed: number }>(
      `/ai/mentor-chat`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  loginWithPassword: (email: string, password: string) =>
    request<AuthResponse>(`/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then((auth) => {
      setAuthTokens(auth);
      return auth;
    }),


  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>(`/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getBillingStatus: () =>
    request<{ plan: string; premiumCredits: number; limits: Record<string, number>; usage: Record<string, number>; stripeConfigured: boolean; razorpayConfigured: boolean; periodEnd: string | null }>('/billing/status'),

  checkPremiumAccess: () =>
    request<{ allowed: boolean; plan: string; premiumCredits: number; reason: string }>('/billing/premium-access'),

  consumePremiumCredit: (feature: string) =>
    request<{ consumed: boolean; reason: string; premiumCredits: number }>('/billing/consume-credit', {
      method: 'POST',
      body: JSON.stringify({ feature }),
    }),

  addPremiumCredits: (count: number) =>
    request<{ premiumCredits: number }>('/billing/add-credits', {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),

  directUpgrade: (plan: 'STUDENT' | 'PRO') =>
    request<{ ok: boolean; plan: string; limits: Record<string, number>; message: string }>('/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  directDowngrade: () =>
    request<{ ok: boolean; plan: string; limits: Record<string, number>; message: string }>('/billing/downgrade', {
      method: 'POST',
    }),

  checkout: (plan: 'STUDENT' | 'PRO') =>
    request<{ url: string }>('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  portal: () =>
    request<{ url: string }>('/billing/portal', {
      method: 'POST',
    }),

  // ─── Razorpay Billing ──────────────────────────────────────────────────

  createRazorpayOrder: (plan: 'STUDENT' | 'PRO', interval: 'monthly' | 'annual' = 'monthly') =>
    request<{
      orderId: string;
      amount: number;
      currency: string;
      keyId: string;
      plan: string;
      interval: string;
      userEmail: string;
      userName: string;
    }>('/billing/razorpay/create-order', {
      method: 'POST',
      body: JSON.stringify({ plan, interval }),
    }),

  verifyRazorpayPayment: (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    plan: 'STUDENT' | 'PRO';
    interval?: 'monthly' | 'annual';
  }) =>
    request<{
      ok: boolean;
      plan: string;
      interval: string;
      limits: Record<string, number>;
      periodEnd: string;
      message: string;
    }>('/billing/razorpay/verify-payment', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPaymentHistory: () =>
    request<Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      plan: string;
      provider: string;
      paymentMethod: string;
      date: string;
    }>>('/billing/payment-history'),

  getAdminSettings: () =>
    request<AdminSettingsResponse>('/admin/settings'),

  setResumeCreationRateLimitEnabled: (enabled: boolean) =>
    request<AdminSettingsResponse>('/admin/settings/rate-limit', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),

  setPaymentFeatureEnabled: (enabled: boolean) =>
    request<AdminSettingsResponse>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ paymentFeatureEnabled: enabled }),
    }),

  getAdminAnalyticsSummary: () =>
    request<{
      totalRegisteredUsers: number;
      totalLoginEvents: number;
      paidSubscribers: number;
      logins24h: number;
      activeRightNow: number;
      newUsers7d: number;
      planBreakdown: Array<{ plan: string; count: number }>;
      providerBreakdown: Array<{ provider: string; count: number }>;
    }>('/admin/analytics/summary'),

  getAdminUsers: (limit?: number) =>
    request<{
      users: Array<{
        id: string;
        fullName: string;
        email: string;
        mobile: string | null;
        isAdmin: boolean;
        loginCount: number;
        plan: string;
        primaryAuthProvider: string;
        hasUserSetPassword: boolean;
        failedLoginCount: number;
        lockedUntil: string | null;
        lastActiveAt: string | null;
        createdAt: string;
      }>;
    }>(`/admin/analytics/users${limit ? `?limit=${limit}` : ''}`),

  getAdminRecentActivity: (limit?: number) =>
    request<{
      events: Array<{
        id: string;
        userId: string;
        email: string;
        method: string;
        ip: string | null;
        userAgent: string | null;
        createdAt: string;
      }>;
    }>(`/admin/analytics/recent-activity${limit ? `?limit=${limit}` : ''}`),

  getAdminLocations: (days?: number) =>
    request<{
      days: number;
      top: Array<{ ip: string | null; count: number }>;
    }>(`/admin/analytics/locations${days ? `?days=${days}` : ''}`),

  // setByokKeyFlag was removed alongside the BYOK feature.

  heartbeat: () =>
    request<void>('/auth/heartbeat', { method: 'POST' }).catch(() => undefined),

  downloadPdf: async (id: string, templateId?: string, downloadToken?: string, fileBaseName?: string) => {
    const params = new URLSearchParams();
    const templateQuery = String(templateId || '').trim();
    if (templateQuery) params.set('templateId', templateQuery);
    if (downloadToken) params.set('downloadToken', downloadToken);
    const qs = params.toString();
    const requestUrl = `${baseUrl}/resumes/${id}/pdf${qs ? `?${qs}` : ''}`;
    const res = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
    });
    if (!res.ok) throw new ApiRequestError(await readApiErrorDetails(res, 'PDF export failed'));
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${slugifyFileName(fileBaseName) || `resume-${id}`}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  },

  /**
   * Download the resume as a Word (.docx) file. Same auth + payment
   * gating as the PDF route — server only serves a valid downloadToken
   * (when the per-download charge is enabled) and uses the user's name
   * for the Content-Disposition filename.
   */
  downloadDocx: async (id: string, downloadToken?: string, fileBaseName?: string) => {
    const params = new URLSearchParams();
    if (downloadToken) params.set('downloadToken', downloadToken);
    const qs = params.toString();
    const requestUrl = `${baseUrl}/resumes/${id}/docx${qs ? `?${qs}` : ''}`;
    const res = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
    });
    if (!res.ok) throw new ApiRequestError(await readApiErrorDetails(res, 'Word export failed'));
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${slugifyFileName(fileBaseName) || `resume-${id}`}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  },

  getPdfBlob: async (id: string, templateId?: string, downloadToken?: string) => {
    const params = new URLSearchParams();
    const templateQuery = String(templateId || '').trim();
    if (templateQuery) params.set('templateId', templateQuery);
    if (downloadToken) params.set('downloadToken', downloadToken);
    const qs = params.toString();
    const url = `${baseUrl}/resumes/${id}/pdf${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
    });
    if (!res.ok) throw new ApiRequestError(await readApiErrorDetails(res, 'PDF export failed'));
    return res.blob();
  },

  // ─── Per-download charge helpers ─────────────────────────────────────────

  getDownloadChargeConfig: () =>
    request<{ enabled: boolean }>('/billing/download-charge/config'),

  initDownloadCharge: (resumeId: string, region?: string) =>
    request<
      | {
          provider: 'razorpay';
          orderId: string;
          amount: number;
          currency: string;
          keyId: string;
          resumeId: string;
        }
      | {
          provider: 'stripe';
          checkoutUrl: string;
          sessionId: string;
          amount: number;
          currency: string;
          resumeId: string;
        }
    >('/billing/download-charge/init', {
      method: 'POST',
      body: JSON.stringify({ resumeId, region }),
    }),

  verifyDownloadChargeRazorpay: (body: {
    resumeId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    request<{ downloadToken: string }>('/billing/download-charge/verify/razorpay', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  verifyDownloadChargeStripe: (body: { resumeId: string; sessionId: string }) =>
    request<{ downloadToken: string }>('/billing/download-charge/verify/stripe', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listJobs: (status?: JobStatus) =>
    request<JobApplication[]>(
      `/jobs${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),

  getJobStats: () => request<JobStats>('/jobs/stats'),

  getUpcomingJobs: (days = 14) =>
    request<JobApplication[]>(`/jobs/upcoming?days=${days}`),

  createJob: (payload: JobApplicationInput) =>
    request<JobApplication>('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateJob: (id: string, payload: JobApplicationInput) =>
    request<JobApplication>(`/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteJob: (id: string) =>
    request<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' }),

  generateCoverLetter: (payload: CoverLetterGenerateRequest) =>
    request<CoverLetterGenerateResponse>('/ai/cover-letter', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listCoverLetters: () => request<CoverLetter[]>('/ai/cover-letters'),

  getCoverLetter: (id: string) =>
    request<CoverLetter>(`/ai/cover-letters/${id}`),

  deleteCoverLetter: (id: string) =>
    request<{ ok: boolean }>(`/ai/cover-letters/${id}`, { method: 'DELETE' }),

  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (email: string, otp: string, newPassword: string) =>
    request<{ ok: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, newPassword }),
    }),

  listResumeVersions: (resumeId: string) =>
    request<ResumeVersionSummary[]>(`/resumes/${resumeId}/versions`),

  snapshotResumeVersion: (
    resumeId: string,
    payload: { label?: string; atsScoreSnapshot?: number } = {},
  ) =>
    request<ResumeVersionSummary>(`/resumes/${resumeId}/versions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  restoreResumeVersion: (resumeId: string, versionId: string) =>
    request<Resume>(`/resumes/${resumeId}/versions/${versionId}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  deleteResumeVersion: (resumeId: string, versionId: string) =>
    request<{ ok: boolean }>(`/resumes/${resumeId}/versions/${versionId}`, {
      method: 'DELETE',
    }),

  // ---------------------------------------------------------------------------
  // Sahaayak — emotional companion with persistent memory.
  // ---------------------------------------------------------------------------
  getSahaayakProfile: () =>
    request<SahaayakProfile>('/sahaayak/profile'),
  optInSahaayak: (payload: { mode?: SahaayakMode; guardrails?: string }) =>
    request<SahaayakProfile>('/sahaayak/opt-in', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  optOutSahaayak: () =>
    request<{ ok: boolean }>('/sahaayak/opt-out', { method: 'POST' }),
  forgetSahaayak: () =>
    request<{ ok: boolean }>('/sahaayak/memory', { method: 'DELETE' }),
  chatSahaayak: (message: string, region: string = 'IN') =>
    request<SahaayakChatResult>('/sahaayak/chat', {
      method: 'POST',
      body: JSON.stringify({ message, region }),
    }),
  listSahaayakMessages: (limit = 30) =>
    request<SahaayakMessage[]>(`/sahaayak/messages?limit=${limit}`),
  recordSahaayakEvent: (payload: {
    kind: string;
    payload?: unknown;
    note?: string;
    moodRating?: number;
    occurredAt?: string;
  }) =>
    request<SahaayakEvent>('/sahaayak/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listSahaayakEvents: (limit = 50) =>
    request<SahaayakEvent[]>(`/sahaayak/events?limit=${limit}`),
  getSahaayakCheckIn: () =>
    request<{ prompt: string }>('/sahaayak/check-in'),

  // ---------------------------------------------------------------------------
  // Admin — PatternLearner review queue.
  // ---------------------------------------------------------------------------
  listPatternFailures: (status?: string) =>
    request<ParseFailureSample[]>(
      `/admin/pattern-learner/failures${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),
  listLearnedPatterns: (status?: string) =>
    request<LearnedPattern[]>(
      `/admin/pattern-learner/patterns${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),
  proposeLearnedPattern: (sampleId: string, kind: string) =>
    request<{ pattern: LearnedPattern; validation: { ok: boolean; reason?: string; metrics: Record<string, number> } }>(
      `/admin/pattern-learner/failures/${sampleId}/propose`,
      { method: 'POST', body: JSON.stringify({ kind }) },
    ),
  promoteLearnedPattern: (id: string) =>
    request<LearnedPattern>(`/admin/pattern-learner/patterns/${id}/promote`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  rejectLearnedPattern: (id: string) =>
    request<LearnedPattern>(`/admin/pattern-learner/patterns/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  rollbackLearnedPattern: (id: string) =>
    request<LearnedPattern>(`/admin/pattern-learner/patterns/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  // ---------------------------------------------------------------------------
  // Outcome Loop — per-version response/interview/offer rates.
  // ---------------------------------------------------------------------------
  getResumeOutcomes: (resumeId: string) =>
    request<OutcomeReport>(`/resumes/${resumeId}/outcomes`),
};

export type OutcomeVersionStats = {
  versionId: string;
  label: string;
  createdAt: string;
  applied: number;
  responses: number;
  interviews: number;
  offers: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  significant: boolean;
};

export type OutcomeReport = {
  versions: OutcomeVersionStats[];
  top: OutcomeVersionStats | null;
  baseline: OutcomeVersionStats | null;
  lift: { multiplier: number | null; deltaPoints: number | null; headline: string };
  unattributed: number;
};

// ---------------------------------------------------------------------------
// Sahaayak / PatternLearner types.
// ---------------------------------------------------------------------------
export type SahaayakMode = 'witness' | 'coach' | 'karmayoga';

export type SahaayakProfile = {
  optedIn: boolean;
  mode?: SahaayakMode;
  guardrails?: string | null;
  summary?: string | null;
  lastInteractionAt?: string | null;
};

export type SahaayakMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  crisisFlag: boolean;
  createdAt: string;
};

export type SahaayakEvent = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  note?: string | null;
  moodRating?: number | null;
  occurredAt: string;
};

export type SahaayakChatResult = {
  reply: string;
  messageId: string;
  crisis: {
    flag: boolean;
    signals: string[];
    resources: Array<{ region: string; name: string; phone?: string; hours: string; notes?: string }>;
  };
};

export type ParseFailureSample = {
  id: string;
  fileName?: string | null;
  redactedText: string;
  verification: { ok: boolean; confidence: number; issues: Array<{ kind: string; detail: string }> };
  extractedShape: Record<string, unknown>;
  trigger: string;
  status: string;
  proposalId?: string | null;
  createdAt: string;
};

export type LearnedPattern = {
  id: string;
  kind: string;
  pattern: string;
  flags: string;
  patternType: string;
  rationale?: string | null;
  examples?: unknown;
  metrics?: { precision?: number; recall?: number; regressionCount?: number; sampleSize?: number } | null;
  status: string;
  sourceSampleId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
};
