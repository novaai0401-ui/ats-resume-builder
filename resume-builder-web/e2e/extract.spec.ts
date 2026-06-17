import { test, expect } from '@playwright/test';
import path from 'node:path';
import { loginViaApi, hasCreds } from './helpers';

/**
 * Upload → extract → populate accuracy. Uploads a fixture résumé and asserts the
 * editor populated COMPLETE bullets (no PDF-wrap fragments) and real contact
 * fields — the exact class of bug the founder reported (half-sentences in
 * inputs, garbage contact). Skips without credentials.
 */
test.describe('upload extraction accuracy', () => {
  test.skip(!hasCreds, 'set E2E_EMAIL / E2E_PASSWORD to run authenticated e2e');

  test.beforeEach(async ({ page, request }) => {
    await loginViaApi(page, request);
  });

  test('uploaded résumé populates whole-sentence bullets and real contact fields', async ({ page }) => {
    await page.goto('/resume/start');

    // The upload control is a hidden <input type=file> behind a label.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'sample-resume.txt'));

    // Land in the editor/review once processing completes.
    await page.waitForURL(/\/resume(\/review)?(\?|$)/, { timeout: 30_000 });

    // Contact fields populated and well-formed.
    const email = page.getByLabel(/^email$/i);
    await expect(email).toHaveValue(/@/, { timeout: 15_000 });

    // Experience bullets: each visible bullet textarea must read as a complete
    // sentence — i.e. NOT begin with a lowercase fragment like
    // "performance and application stability..." (the wrap-split bug).
    const bullets = page.locator('textarea.bullet-input');
    const count = await bullets.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const text = (await bullets.nth(i).inputValue()).trim();
      if (!text) continue;
      expect(text[0], `bullet ${i} starts with a lowercase fragment: "${text}"`).toMatch(/[A-Z0-9]/);
    }
  });
});
