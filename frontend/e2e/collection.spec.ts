import { test, expect } from '@playwright/test';
import { seedGame, deleteGame, e2eTitle } from './support/api';

test.describe('Collection page', () => {
  let gameId: number;
  let title: string;

  test.beforeEach(async ({ request }) => {
    title = e2eTitle('Collection Game');
    gameId = await seedGame(request, {
      title,
      minPlayers: 2,
      maxPlayers: 4,
      minPlayTimeMinutes: 30,
      maxPlayTimeMinutes: 60,
      personalRating: 8,
      categories: ['Strategy']
    });
  });

  test.afterEach(async ({ request }) => {
    await deleteGame(request, gameId);
  });

  test('lists a seeded game with its details', async ({ page }) => {
    await page.goto('/collection');
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('2–4');
    await expect(row).toContainText('8');
  });

  test('search filters the table by title', async ({ page }) => {
    await page.goto('/collection');
    const search = page.getByPlaceholder('Search title, categories, mechanics, notes, players, time, rating…');

    await search.fill(title);
    await expect(page.getByRole('button', { name: title })).toBeVisible();

    await search.fill('__no_such_game_should_exist__');
    await expect(page.getByText(/No games match/)).toBeVisible();
    await expect(page.getByRole('button', { name: title })).not.toBeVisible();
  });

  test('log play increments the play count', async ({ page }) => {
    await page.goto('/collection');
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
    await expect(row.locator('.plays-cell')).toHaveText('0');

    await row.getByTitle('Log play').click();
    await expect(row.locator('.plays-cell')).toHaveText('1');
    await expect(row.getByTitle('Logged!')).toBeVisible();
  });

  test('delete requires confirmation', async ({ page }) => {
    await page.goto('/collection');
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
    await row.getByTitle('Delete').click();

    const dialog = page.locator('dialog.modal', { hasText: 'Delete game?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(title);

    // Cancel leaves the game in place.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: title })).toBeVisible();

    // Confirm actually removes it.
    await row.getByTitle('Delete').click();
    await page.locator('dialog.modal', { hasText: 'Delete game?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: title })).not.toBeVisible();
  });
});
