import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { seedGame, deleteGame, e2eTitle, waitForTagDescription, deleteTagDescription } from './support/api';

// Preferences live in localStorage, so every test's fresh browser context starts from
// the defaults — nothing to clean up. Tests for actions that would rewrite or delete
// real data (BGG refresh, Dictionary housekeeping, restore) mock the network instead.
test.describe('Settings page', () => {
  test('Collection sorts by the chosen default', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('Collection sorts by').selectOption({ label: 'Most played' });

    await page.goto('/collection');
    await page.locator('.sort-btn').click();
    await expect(page.locator('.sort-option.selected')).toHaveText('Most played');
  });

  test('Suggest starts with the chosen default players', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('Suggest starts with players').selectOption({ label: '4' });

    await page.goto('/suggest');
    await expect(page.locator('.field__value').first()).toHaveText('4');
  });

  test('preferences survive a reload and can be reset', async ({ page }) => {
    await page.goto('/settings');
    const sort = page.getByLabel('Collection sorts by');
    await sort.selectOption({ label: 'Highest rated' });

    await page.reload();
    await expect(sort).toHaveValue(/rating-desc/);

    await page.getByRole('button', { name: 'Reset preferences' }).click();
    await expect(sort).toHaveValue(/title-asc/);
  });

  test('"New" badges can be turned off', async ({ page, request }) => {
    const category = e2eTitle('badge pref category');
    const id = await seedGame(request, { title: e2eTitle('badge pref game'), categories: [category] });
    const tag = await waitForTagDescription(request, category, 'CATEGORY');
    try {
      await page.goto('/settings');
      await page.getByLabel('Show "New" badges on Dictionary entries').uncheck();

      await page.goto('/dictionary');
      const row = page.locator('.entry', { has: page.locator('.entry__name', { hasText: category }) });
      await expect(row).toBeVisible();
      await expect(row.locator('.badge--new')).not.toBeVisible();
    } finally {
      await deleteGame(request, id);
      if (tag) await deleteTagDescription(request, tag.id);
    }
  });

  test('downloads a backup file containing the collection', async ({ page, request }) => {
    const title = e2eTitle('backup game');
    const id = await seedGame(request, { title });
    try {
      await page.goto('/settings');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download backup' }).click()
      ]);
      expect(download.suggestedFilename()).toMatch(/^game-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);

      const backup = JSON.parse(readFileSync(await download.path(), 'utf8'));
      expect(backup.version).toBe(1);
      expect(backup.games.map((g: { game: { title: string } }) => g.game.title)).toContain(title);
    } finally {
      await deleteGame(request, id);
    }
  });

  test('restore asks for confirmation, rejects non-backup files, and can be cancelled', async ({ page }) => {
    await page.goto('/settings');
    const file = page.locator('#restore-file');

    await file.setInputFiles({ name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await expect(page.getByRole('alert')).toContainText("isn't a Game Tracker backup");

    const backup = { version: 1, games: [{ game: { title: 'A' }, plays: [{}, {}] }, { game: { title: 'B' }, plays: [] }], wishlist: [{}] };
    await file.setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    const confirm = page.getByRole('alertdialog', { name: 'Confirm restore' });
    await expect(confirm).toContainText('2 games, 2 plays, 1 wishlist items');

    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).not.toBeVisible();
  });

  test('refresh-all merges BGG details into each linked game and saves it', async ({ page }) => {
    const game = {
      id: 999, bggId: 123, title: 'Mock Game', minPlayers: 2, maxPlayers: 4,
      minPlayTimeMinutes: 30, maxPlayTimeMinutes: 60, complexityWeight: 2, categories: ['Old'], mechanics: [],
      bestPlayerCounts: [], notes: 'mine', personalRating: 9, favorite: true
    };
    const details = {
      bggId: 123, title: 'Mock Game', yearPublished: 2020, description: 'From BGG', thumbnailUrl: null, imageUrl: null,
      minPlayers: 3, maxPlayers: 5, minPlayTimeMinutes: 45, maxPlayTimeMinutes: 90, complexityWeight: 3,
      categories: ['Fresh'], mechanics: ['Dice Rolling'], bestPlayerCounts: [4], basedOnBggId: null, basedOnGameName: null
    };
    let saved: Record<string, unknown> | null = null;
    await page.route('**/api/games', route => route.fulfill({ json: [game] }));
    await page.route('**/api/bgg/123', route => route.fulfill({ json: details }));
    await page.route('**/api/games/999', async route => {
      saved = route.request().postDataJSON();
      await route.fulfill({ json: saved });
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Refresh all games' }).click();
    await expect(page.getByText('Refreshed 1 of 1 games.')).toBeVisible();

    expect(saved).toMatchObject({
      notes: 'From BGG', categories: ['Fresh'], mechanics: ['Dice Rolling'], minPlayers: 3,
      personalRating: 9, favorite: true
    });
  });

  test('Dictionary housekeeping reports what it removed', async ({ page }) => {
    await page.route('**/api/tag-descriptions/pending', route => route.fulfill({ json: { deleted: 3 } }));
    await page.route('**/api/tag-descriptions/overrides', route => route.fulfill({ json: { deleted: 2 } }));

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Clear "Not yet described" entries' }).click();
    await expect(page.getByText('Cleared 3 "Not yet described" entries.')).toBeVisible();

    await page.getByRole('button', { name: 'Reset all my edits to the originals' }).click();
    await expect(page.getByText('Restored 2 edited entries to the originals.')).toBeVisible();
  });
});
