import { type Page, type APIRequestContext, expect } from '@playwright/test';

export const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

export const E2E_EMAIL = process.env.E2E_EMAIL || '';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || '';
export const hasCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
};

/**
 * Log in through the API (faster + less flaky than driving the UI) and inject
 * the tokens into localStorage exactly the way the web app stores them
 * (see setAuthTokens in src/lib/api.ts), so the app boots authenticated.
 */
export async function loginViaApi(page: Page, request: APIRequestContext): Promise<void> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  expect(res.ok(), `login failed (${res.status()})`).toBeTruthy();
  const auth = (await res.json()) as AuthResponse;

  await page.addInitScript((a: AuthResponse) => {
    localStorage.setItem('accessToken', a.accessToken);
    localStorage.setItem('refreshToken', a.refreshToken);
    localStorage.setItem('userId', a.user.id);
    localStorage.setItem('userEmail', a.user.email);
    localStorage.setItem('rb_session_start', String(Date.now()));
  }, auth);
}
