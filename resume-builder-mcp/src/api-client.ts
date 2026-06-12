/**
 * Minimal authenticated client for the Pocket Resume REST API.
 *
 * The MCP server is a THIN wrapper: every tool call delegates to the
 * same endpoints the web app uses, so plan gating, AI-token quotas,
 * rate limits, and outcome attribution (C-007) all come free — an
 * agent cannot do anything a logged-in user couldn't.
 *
 * Auth: POCKET_RESUME_TOKEN (the user's access token, from
 * Settings → API access or the login response). We deliberately do
 * NOT implement refresh here — when the token expires the tools
 * return a clear re-auth message and the user mints a new one. An
 * MCP server quietly holding refresh credentials is a bigger risk
 * than the inconvenience.
 */

export type ApiClientConfig = {
  baseUrl: string;
  token: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class PocketResumeClient {
  constructor(private readonly config: ApiClientConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.token}`,
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string | string[] };
        const m = body?.message;
        message = Array.isArray(m) ? m.join('; ') : m || message;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, message);
    }
    return (await res.json()) as T;
  }

  listResumes() {
    return this.request<Array<{ id: string; title: string; updatedAt?: string }>>('/resumes');
  }

  getResume(id: string) {
    return this.request<Record<string, unknown>>(`/resumes/${encodeURIComponent(id)}`);
  }

  listVersions(resumeId: string) {
    return this.request<Array<{ id: string; label: string | null; atsScoreSnapshot: number | null; createdAt: string }>>(
      `/resumes/${encodeURIComponent(resumeId)}/versions`,
    );
  }

  tailorPropose(resumeId: string, jdText: string) {
    return this.request<{
      summary: { before: string; after: string } | null;
      bullets: Array<{ experienceIndex: number; bulletIndex: number; before: string; after: string }>;
      skillsToAdd: string[];
    }>(`/ai/tailor/${encodeURIComponent(resumeId)}/propose`, {
      method: 'POST',
      body: JSON.stringify({ jdText }),
    });
  }

  tailorApply(resumeId: string, input: Record<string, unknown>) {
    return this.request<{
      version: { id: string; label: string | null; createdAt: string };
      appliedBullets: number;
      rejectedAsStale: number;
    }>(`/ai/tailor/${encodeURIComponent(resumeId)}/apply`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  createJobApplication(input: Record<string, unknown>) {
    return this.request<{ id: string; company: string; role: string; status: string }>('/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getOutcomes(resumeId: string) {
    return this.request<Record<string, unknown>>(`/resumes/${encodeURIComponent(resumeId)}/outcomes`);
  }
}
