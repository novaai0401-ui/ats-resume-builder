import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright end-to-end tests for CallbackCV (web).
 *
 * Runs against a deployed/preview URL or a locally-served build.
 *   PLAYWRIGHT_BASE_URL   target origin (default http://localhost:3000)
 *   E2E_EMAIL / E2E_PASSWORD  optional creds; auth-gated specs SKIP without them
 *                              (so the public smoke suite still runs anywhere).
 *
 * Local:   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
 * Preview: PLAYWRIGHT_BASE_URL=https://ats-rb-web.onrender.com \
 *          E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// Only auto-boot a local dev server when targeting localhost AND not told to skip.
const useLocalServer =
  baseURL.includes('localhost') && process.env.PLAYWRIGHT_NO_SERVER !== '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile profile — catches the kind of layout/tap bugs the founder hit
    // (template selection, Sahaayak overlap, share card overflow).
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  ...(useLocalServer
    ? {
        webServer: {
          command: 'npm run start',
          url: baseURL,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
        },
      }
    : {}),
});
