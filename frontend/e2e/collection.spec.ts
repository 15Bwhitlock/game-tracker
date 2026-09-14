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
      categories: ['Strategy'],
      mechanics: ['Hand Management'],
      notes: 'A note only this seeded game should have.'
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
    // td order: Title, Players, Time, Complexity, Plays, Last Played, Personal Rating, actions.
    await expect(row.locator('td').nth(6)).toHaveText('8');
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

  test('search matches by category, mechanic, and notes text', async ({ page }) => {
    await page.goto('/collection');
    const search = page.getByPlaceholder('Search title, categories, mechanics, notes, players, time, rating…');
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });

    await search.fill('Strategy');
    await expect(row).toBeVisible();

    await search.fill('Hand Management');
    await expect(row).toBeVisible();

    await search.fill('only this seeded game should have');
    await expect(row).toBeVisible();
  });

  test('search matches by numeric player count and play time', async ({ page }) => {
    await page.goto('/collection');
    const search = page.getByPlaceholder('Search title, categories, mechanics, notes, players, time, rating…');
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });

    // 3 falls inside this game's 2-4 player range.
    await search.fill('3');
    await expect(row).toBeVisible();

    // 45 falls inside its 30-60 minute range.
    await search.fill('45');
    await expect(row).toBeVisible();
  });

  test('search suggestions dropdown lists matching titles and categories', async ({ page }) => {
    await page.goto('/collection');
    const search = page.getByPlaceholder('Search title, categories, mechanics, notes, players, time, rating…');

    await search.fill(title.slice(0, -2));
    const suggestions = page.locator('.search-suggestions');
    await expect(suggestions).toBeVisible();
    // Suggestion items use role="option" (a listbox), not the default button role.
    await expect(suggestions.getByRole('option', { name: title })).toBeVisible();

    await suggestions.getByRole('option', { name: title }).click();
    await expect(search).toHaveValue(title);
  });

  test('log play increments the play count', async ({ page }) => {
    await page.goto('/collection');
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
    await expect(row.locator('.plays-cell')).toHaveText('0');

    await row.getByTitle('Log play').click();
    await expect(row.locator('.plays-cell')).toHaveText('1');
    await expect(row.getByTitle('Logged!')).toBeVisible();
  });

  test('undo on the log-play toast reverts the play count', async ({ page }) => {
    await page.goto('/collection');
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });

    await row.getByTitle('Log play').click();
    await expect(row.locator('.plays-cell')).toHaveText('1');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(row.locator('.plays-cell')).toHaveText('0');
    await expect(row.getByTitle('Log play')).toBeVisible();
  });

  test('toggling the favorite star updates the row and persists', async ({ page }) => {
    await page.goto('/collection');
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
    const star = row.locator('.star-btn');

    await expect(star).toHaveText('☆');
    await star.click();
    await expect(star).toHaveText('★');

    // Reload to confirm it was actually persisted, not just a local UI flip.
    await page.reload();
    await expect(row.locator('.star-btn')).toHaveText('★');
  });

  test('opens the detail modal with full game details and play history', async ({ page }) => {
    await page.goto('/collection');
    await page.getByRole('button', { name: title }).click();

    const dialog = page.locator('dialog.modal--detail');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
    await expect(dialog).toContainText('2–4');
    await expect(dialog).toContainText('8 / 10');
    await expect(dialog.locator('.tag', { hasText: 'Strategy' })).toBeVisible();
    await expect(dialog.locator('.tag', { hasText: 'Hand Management' })).toBeVisible();
    await expect(dialog).toContainText('No plays recorded yet.');

    // Toggling favorite from inside the modal should update it in place.
    await dialog.locator('.btn--star').click();
    await expect(dialog.locator('.btn--star')).toHaveText('★');

    await dialog.locator('.modal__footer').getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();
    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
    await expect(row.locator('.star-btn')).toHaveText('★');
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

  test('editing preserves the current search term across navigation', async ({ page }) => {
    await page.goto('/collection');
    const search = page.getByPlaceholder('Search title, categories, mechanics, notes, players, time, rating…');
    await search.fill(title);

    const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
    await row.getByTitle('Edit').click();

    await expect(page).toHaveURL(new RegExp(`/games/${gameId}/edit\\?search=`));
    await page.locator('.page__header').getByRole('button', { name: 'Cancel' }).click();

    await expect(page).toHaveURL(/\/collection\?search=/);
    await expect(page.getByPlaceholder('Search title, categories, mechanics, notes, players, time, rating…')).toHaveValue(title);
  });
});

test.describe('Collection page sorting', () => {
  const ids: number[] = [];

  test.afterEach(async ({ request }) => {
    await Promise.all(ids.splice(0).map((id) => deleteGame(request, id)));
  });

  test('favorites-first sort puts the favorited game above a non-favorite, alphabetically otherwise', async ({ page, request }) => {
    const zTitle = e2eTitle('Zzz Non Favorite');
    const aTitle = e2eTitle('Aaa Favorite');
    ids.push(await seedGame(request, { title: zTitle }));
    ids.push(await seedGame(request, { title: aTitle, favorite: true }));

    await page.goto('/collection');
    await page.locator('.sort-btn').click();
    await page.getByRole('button', { name: 'Favorites first' }).click();

    const favoriteRow = page.locator('tr', { has: page.getByRole('button', { name: aTitle }) });
    const nonFavoriteRow = page.locator('tr', { has: page.getByRole('button', { name: zTitle }) });

    const favoriteIndex = await favoriteRow.evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    const nonFavoriteIndex = await nonFavoriteRow.evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    expect(favoriteIndex).toBeLessThan(nonFavoriteIndex);
  });

  test('most-played sort orders by play count, and title Z-A reverses alphabetical order', async ({ page, request }) => {
    const lowTitle = e2eTitle('Aaa Rarely Played');
    const highTitle = e2eTitle('Zzz Often Played');
    const lowId = await seedGame(request, { title: lowTitle });
    const highId = await seedGame(request, { title: highTitle });
    ids.push(lowId, highId);
    await request.post(`/api/games/${highId}/plays`, { data: {} });
    await request.post(`/api/games/${highId}/plays`, { data: {} });
    await request.post(`/api/games/${lowId}/plays`, { data: {} });

    await page.goto('/collection');
    await page.locator('.sort-btn').click();
    await page.getByRole('button', { name: 'Most played' }).click();

    const highRow = page.locator('tr', { has: page.getByRole('button', { name: highTitle }) });
    const lowRow = page.locator('tr', { has: page.getByRole('button', { name: lowTitle }) });
    const highIndex = await highRow.evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    const lowIndex = await lowRow.evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    // highTitle (2 plays) should rank above lowTitle (1 play) despite sorting after it alphabetically.
    expect(highIndex).toBeLessThan(lowIndex);

    // Title (Z-A) should reverse that: lowTitle ("Aaa...") now sorts after highTitle ("Zzz...").
    await page.locator('.sort-btn').click();
    await page.getByRole('button', { name: 'Title (Z–A)' }).click();
    const highIndexZA = await highRow.evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    const lowIndexZA = await lowRow.evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    expect(highIndexZA).toBeLessThan(lowIndexZA);
  });

  test('sort dropdown closes when clicking outside it', async ({ page }) => {
    await page.goto('/collection');
    await page.locator('.sort-btn').click();
    await expect(page.locator('.sort-dropdown')).toBeVisible();

    await page.locator('h1', { hasText: 'Collection' }).click();
    await expect(page.locator('.sort-dropdown')).not.toBeVisible();
  });
});

test.describe('Collection page error handling', () => {
  test('shows an error banner when the games list fails to load', async ({ page }) => {
    await page.route('**/api/games', (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated collection load failure' }) });
    });

    await page.goto('/collection');
    await expect(page.getByRole('alert')).toHaveText('Simulated collection load failure');
  });
});
