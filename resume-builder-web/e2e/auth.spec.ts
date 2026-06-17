import { test, expect } from '@playwright/test';

/**
 * Auth form validation — public, exercises the client-side guards we added:
 *  - clear email message (not the native tooltip)
 *  - password min length unified to 10
 */

test('register rejects an invalid email with a clear message', async ({ page }) => {
  await page.goto('/auth/register');
  await page.getByLabel(/full name/i).fill('Test User');
  await page.getByLabel(/^email$/i).fill('not-an-email');
  // Phone + a valid-length password so email is the only failing field.
  await page.getByLabel(/password/i).fill('Sufficient1!');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText(/valid email address/i)).toBeVisible();
});

test('register rejects a short password (min 10)', async ({ page }) => {
  await page.goto('/auth/register');
  await page.getByLabel(/full name/i).fill('Test User');
  await page.getByLabel(/^email$/i).fill('valid@example.com');
  await page.getByLabel(/password/i).fill('short1!'); // < 10
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
});

test('login page shows the BYOK-aware sign-in, no subscription upsell', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  await expect(page.getByText(/upgrade to (student|pro)/i)).toHaveCount(0);
});
