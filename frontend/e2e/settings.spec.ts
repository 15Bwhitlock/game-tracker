import { test, expect } from '@playwright/test';
import { getAiEnabled, setAiEnabled } from './support/api';

test.describe('Settings page', () => {
  test.afterEach(async ({ request }) => {
    // Never leave AI toggled off for the rest of the suite — other specs
    // (e.g. dictionary.spec.ts's AI-tag test) assume it's on by default.
    await setAiEnabled(request, true);
  });

  test('shows the current AI setting and lets you turn it off and back on', async ({ page, request }) => {
    await setAiEnabled(request, true);

    await page.goto('/settings');
    const toggle = page.getByRole('checkbox', { name: /Auto-write category\/mechanic descriptions with AI/ });
    await expect(toggle).toBeChecked();

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect.poll(() => getAiEnabled(request)).toBe(false);

    // Reload to confirm the change was actually persisted server-side, not just local state.
    await page.reload();
    await expect(toggle).not.toBeChecked();

    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect.poll(() => getAiEnabled(request)).toBe(true);
  });
});
