import { test, expect } from '@playwright/test';

test.describe('App shell', () => {
  test('theme toggle switches dark/light mode and persists across reload', async ({ page }) => {
    await page.goto('/collection');
    const toggle = page.locator('.theme-toggle');
    const html = page.locator('html');

    // Start from a known state regardless of the browser's OS-level preference.
    const startedDark = (await html.getAttribute('class'))?.includes('dark') ?? false;
    if (startedDark) {
      await toggle.click();
      await expect(html).not.toHaveClass(/dark/);
    }

    await toggle.click();
    await expect(html).toHaveClass(/dark/);
    await expect(toggle).toHaveText('☀️');

    await page.reload();
    await expect(html).toHaveClass(/dark/);

    // Leave it back where we found it so this test doesn't affect others via localStorage.
    await page.locator('.theme-toggle').click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test('nav links move between pages and highlight the active route', async ({ page }) => {
    await page.goto('/collection');
    const nav = page.locator('nav');
    await expect(nav.getByRole('link', { name: 'Collection' })).toHaveClass(/active/);

    await nav.getByRole('link', { name: 'Suggest' }).click();
    await expect(page).toHaveURL(/\/suggest/);
    await expect(nav.getByRole('link', { name: 'Suggest' })).toHaveClass(/active/);
    await expect(nav.getByRole('link', { name: 'Collection' })).not.toHaveClass(/active/);

    await nav.getByRole('link', { name: 'Dictionary' }).click();
    await expect(page).toHaveURL(/\/dictionary/);
    await expect(nav.getByRole('link', { name: 'Dictionary' })).toHaveClass(/active/);

    await page.locator('.brand').click();
    await expect(page).toHaveURL(/\/collection/);
  });

  test('an unknown URL renders the 404 page instead of a blank one', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(page.getByText("That page doesn't exist.")).toBeVisible();

    await page.getByRole('link', { name: 'Back to your collection' }).click();
    await expect(page).toHaveURL(/\/collection/);
  });
});
