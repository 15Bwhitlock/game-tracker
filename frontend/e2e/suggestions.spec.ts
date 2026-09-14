import { test, expect } from '@playwright/test';
import { seedGame, deleteGame, e2eTitle } from './support/api';

test.describe('Suggestions page', () => {
  test('renders the criteria form with presets and button groups', async ({ page }) => {
    await page.goto('/suggest');
    await expect(page.getByRole('heading', { name: 'What should we play?' })).toBeVisible();
    // Scoped to .presets: "Party" is also a category chip name elsewhere on the page.
    const presets = page.locator('.presets');
    for (const preset of ['Quick game', 'Game night', 'Party', 'New to me', 'Top picks']) {
      await expect(presets.getByRole('button', { name: preset, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('group', { name: 'Player count' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suggest' })).toBeVisible();
  });

  test('applying the "Game night" preset fills in the matching criteria', async ({ page }) => {
    await page.goto('/suggest');
    await page.getByRole('button', { name: 'Game night', exact: true }).click();

    // Preset draft: { minPlayers: 4, maxPlayers: 4, maxMinutes: 120, minComplexity: 2, maxComplexity: 3 }
    await expect(
      page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '4', exact: true })
    ).toHaveClass(/selected/);
    await expect(page.locator('.field', { hasText: 'Play time' })).toContainText('up to 2h');
    await expect(page.locator('.field', { hasText: 'Complexity' })).toContainText('Light – Medium');
  });

  test('shows a validation error when submitted without a player count', async ({ page }) => {
    await page.goto('/suggest');
    await page.getByRole('button', { name: 'Suggest' }).click();
    await expect(page.getByRole('alert')).toHaveText('Player count is required.');
  });

  test('valid criteria return a matching seeded game', async ({ page, request }) => {
    // A distinctive category avoids matching anything already in the real
    // collection this suite runs against.
    const category = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const title = e2eTitle('suggestable');
    const id = await seedGame(request, {
      title,
      minPlayers: 2,
      maxPlayers: 4,
      minPlayTimeMinutes: 30,
      maxPlayTimeMinutes: 60,
      categories: [category]
    });

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: category, exact: true }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();

      const result = page.locator('li.suggestion', { hasText: title });
      await expect(result).toBeVisible();
      await expect(result).toContainText(category);

      await result.getByRole('button', { name: 'Log play' }).click();
      await expect(result.getByRole('button', { name: '✓ Logged!' })).toBeVisible();
    } finally {
      await deleteGame(request, id);
    }
  });
});
