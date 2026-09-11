import { test, expect } from '@playwright/test';
import { seedGame, deleteGame, deleteAllE2eGames, e2eTitle } from './support/api';

test.describe('Add / edit game form', () => {
  test.afterEach(async ({ request }) => {
    // Safety net in case a test fails before its own cleanup runs.
    await deleteAllE2eGames(request);
  });

  test('adding a game through the form persists it to the collection', async ({ page }) => {
    const title = e2eTitle('add flow');

    await page.goto('/games/add');
    await page.getByPlaceholder('Game Title').fill(title);
    await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '3', exact: true }).click();
    await page.getByRole('group', { name: 'Play time' }).getByRole('button', { name: '45m', exact: true }).click();
    await page.getByRole('button', { name: 'Strategy', exact: true }).click();

    await page.getByRole('button', { name: 'Save game' }).click();

    await expect(page).toHaveURL(/\/collection/);
    await expect(page.getByRole('button', { name: title })).toBeVisible();
  });

  test('shows a validation error when player count is missing', async ({ page }) => {
    await page.goto('/games/add');
    await page.getByPlaceholder('Game Title').fill(e2eTitle('missing players'));
    // Deliberately skip selecting players/play time.
    await page.getByRole('button', { name: 'Save game' }).click();

    await expect(page.getByRole('alert')).toHaveText('Player count is required.');
    await expect(page).toHaveURL(/\/games\/add/);
  });

  test('editing an existing game updates it', async ({ page, request }) => {
    const title = e2eTitle('edit flow');
    const id = await seedGame(request, { title, minPlayers: 2, maxPlayers: 2 });

    await page.goto(`/games/${id}/edit`);
    await expect(page.getByPlaceholder('Game Title')).toHaveValue(title);

    await page.getByRole('group', { name: 'Personal rating' }).getByRole('button', { name: '9', exact: true }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/collection/);
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
    await expect(row).toContainText('9');

    await deleteGame(request, id);
  });
});
