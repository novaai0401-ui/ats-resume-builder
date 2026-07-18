import { test, expect } from '@playwright/test';

/** Public smoke — runs with no credentials, on any target URL. */

test('home page loads and shows the brand', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/CallbackCV|Resume/i);
  await expect(page.getByText(/CallbackCV/i).first()).toBeVisible();
});

test('pricing page reflects the ₹49-per-download + single ₹499/mo plan model', async ({ page }) => {
  await page.goto('/billing');
  // Either the pricing page renders, or an unauthenticated app bounces to login.
  // Both are acceptable; if it renders, it must show the CURRENT model:
  //   • ₹49 per download for everyone
  //   • exactly ONE subscription — CallbackCV Plus at ₹499/mo
  //   • no legacy Student/Pro tiers or their prices
  const onLogin = page.url().includes('/auth/login');
  if (onLogin) return;
  await expect(page.getByText(/₹49/).first()).toBeVisible();
  await expect(page.getByText(/₹499/).first()).toBeVisible();
  await expect(page.getByText(/CallbackCV Plus/i).first()).toBeVisible();
  // Legacy tiers must stay gone.
  await expect(page.getByText(/₹199|₹399|₹799/)).toHaveCount(0);
  await expect(page.getByText(/Student plan|Pro plan/i)).toHaveCount(0);
});
