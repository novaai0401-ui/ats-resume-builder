import { test, expect } from '@playwright/test';

/** Public smoke — runs with no credentials, on any target URL. */

test('home page loads and shows the brand', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Pocket Resume|Resume/i);
  await expect(page.getByText(/Pocket Resume/i).first()).toBeVisible();
});

test('pricing page reflects the no-subscription, ₹49-per-download model', async ({ page }) => {
  await page.goto('/billing');
  // Either the pricing page renders, or an unauthenticated app bounces to login.
  // Both are acceptable; if it renders, it must NOT advertise monthly plans.
  const onLogin = page.url().includes('/auth/login');
  if (onLogin) return;
  await expect(page.getByText(/₹49/).first()).toBeVisible();
  await expect(page.getByText(/No subscriptions|per download/i).first()).toBeVisible();
  await expect(page.getByText(/₹199|₹499|\/mo/i)).toHaveCount(0);
});
