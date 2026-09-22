import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { seedGame, deleteGame, e2eTitle } from './support/api';

test.describe('Collection page', () => {
  let gameId: number;
  let title: string;

  test.beforeEach(async ({ page, request }) => {
    // These tests assert against table-specific markup (.plays-cell, <tr> rows, etc.),
    // so force list view regardless of the grid default — the view-toggle describe
    // block below is what actually tests grid view and the default itself.
    await page.addInitScript(() => localStorage.setItem('collectionViewMode', 'list'));
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
    // td order: Select, Title, Players, Time, Complexity, Plays, Last Played, Personal Rating, actions.
    await expect(row.locator('td').nth(7)).toHaveText('8');
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

  test('Export downloads the whole collection as JSON, including this seeded game', async ({ page }) => {
    await page.goto('/collection');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^game-tracker-export-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    const contents = JSON.parse(await readFile(path!, 'utf-8'));
    expect(Array.isArray(contents)).toBe(true);
    expect(contents.some((g: { id: number }) => g.id === gameId)).toBe(true);
    const exportedGame = contents.find((g: { id: number }) => g.id === gameId);
    expect(exportedGame.title).toBe(title);
    expect(exportedGame.notes).toBe('A note only this seeded game should have.');
  });
});

test.describe('Collection page BGG metadata display', () => {
  test.beforeEach(async ({ page }) => {
    // The row-thumbnail assertion below is list-view-specific markup.
    await page.addInitScript(() => localStorage.setItem('collectionViewMode', 'list'));
  });

  test('shows a thumbnail and year in the row, and the full image and year in the detail modal', async ({ page, request }) => {
    const title = e2eTitle('Illustrated Game');
    const id = await seedGame(request, {
      title,
      thumbnailUrl: 'https://cf.geekdo-images.com/example/thumb.jpg',
      imageUrl: 'https://cf.geekdo-images.com/example/full.jpg',
      yearPublished: 1995
    });

    try {
      await page.goto('/collection');
      const row = page.locator('tr', { has: page.getByRole('button', { name: title }) });
      await expect(row.locator('.title-thumbnail')).toHaveAttribute('src', 'https://cf.geekdo-images.com/example/thumb.jpg');
      await expect(row.locator('.title-year')).toHaveText('(1995)');

      await page.getByRole('button', { name: title }).click();
      const dialog = page.locator('dialog.modal--detail');
      await expect(dialog.locator('.modal__header-year')).toHaveText('(1995)');
      await expect(dialog.locator('.detail-image')).toHaveAttribute('src', 'https://cf.geekdo-images.com/example/full.jpg');
    } finally {
      await deleteGame(request, id);
    }
  });

  test('falls back to the thumbnail in the detail modal when no full-size image is set', async ({ page, request }) => {
    const title = e2eTitle('Thumbnail Only Game');
    const id = await seedGame(request, {
      title,
      thumbnailUrl: 'https://cf.geekdo-images.com/example/thumb-only.jpg'
    });

    try {
      await page.goto('/collection');
      await page.getByRole('button', { name: title }).click();
      const dialog = page.locator('dialog.modal--detail');
      await expect(dialog.locator('.detail-image')).toHaveAttribute('src', 'https://cf.geekdo-images.com/example/thumb-only.jpg');
      await expect(dialog.locator('.modal__header-year')).toHaveCount(0);
    } finally {
      await deleteGame(request, id);
    }
  });
});

test.describe('Collection page sorting', () => {
  const ids: number[] = [];

  test.beforeEach(async ({ page }) => {
    // These tests compare <tr> DOM order, which only exists in list view.
    await page.addInitScript(() => localStorage.setItem('collectionViewMode', 'list'));
  });

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

test.describe('Collection page view toggle', () => {
  test('switches between list and grid view, and remembers the choice across reloads', async ({ page, request }) => {
    const title = e2eTitle('View Toggle Game');
    const id = await seedGame(request, {
      title,
      thumbnailUrl: 'https://cf.geekdo-images.com/example/thumb.jpg',
      imageUrl: 'https://cf.geekdo-images.com/example/full.jpg'
    });

    try {
      await page.goto('/collection');
      // Defaults to grid view.
      await expect(page.locator('.game-grid')).toBeVisible();
      await expect(page.locator('table.table')).not.toBeVisible();

      await page.locator('.view-toggle__btn[title="List view"]').click();
      await expect(page.locator('table.table')).toBeVisible();
      await expect(page.locator('.game-grid')).not.toBeVisible();

      await page.locator('.view-toggle__btn[title="Grid view"]').click();
      await expect(page.locator('.game-grid')).toBeVisible();
      await expect(page.locator('table.table')).not.toBeVisible();

      const tile = page.locator('.grid-tile', { has: page.getByRole('button', { name: title }) });
      await expect(tile.locator('.grid-tile__cover img')).toHaveAttribute('src', 'https://cf.geekdo-images.com/example/full.jpg');

      // Reloading should remember the grid choice (persisted to localStorage).
      await page.reload();
      await expect(page.locator('.game-grid')).toBeVisible();

      // Clicking a tile's title still opens the same detail modal as list view.
      await tile.getByRole('button', { name: title }).click();
      await expect(page.locator('dialog.modal--detail')).toBeVisible();
    } finally {
      await deleteGame(request, id);
    }
  });

  test('grid view shows a placeholder for games with no image', async ({ page, request }) => {
    const title = e2eTitle('No Image Game');
    const id = await seedGame(request, { title });

    try {
      await page.goto('/collection');
      await page.locator('.view-toggle__btn[title="Grid view"]').click();
      const tile = page.locator('.grid-tile', { has: page.getByRole('button', { name: title }) });
      await expect(tile.locator('.grid-tile__placeholder')).toBeVisible();
      await expect(tile.locator('.grid-tile__cover img')).toHaveCount(0);
    } finally {
      await deleteGame(request, id);
    }
  });
});

test.describe('Collection page BGG filter', () => {
  test('filters to BGG-linked or unlinked games, updates the count, and still combines with sort', async ({ page, request }) => {
    const linkedTitle = e2eTitle('Filter Linked Game');
    const unlinkedTitle = e2eTitle('Filter Unlinked Game');
    const linkedLowRated = e2eTitle('Filter Linked Low Rated');
    const linkedId = await seedGame(request, { title: linkedTitle, bggId: 999901, personalRating: 9 });
    const unlinkedId = await seedGame(request, { title: unlinkedTitle });
    const linkedLowId = await seedGame(request, { title: linkedLowRated, bggId: 999902, personalRating: 2 });

    try {
      await page.goto('/collection');

      await page.locator('.filter-btn').click();
      await page.getByRole('button', { name: 'BGG-linked', exact: true }).click();
      await expect(page.getByRole('button', { name: linkedTitle })).toBeVisible();
      await expect(page.getByRole('button', { name: linkedLowRated })).toBeVisible();
      await expect(page.getByRole('button', { name: unlinkedTitle })).not.toBeVisible();
      await expect(page.locator('.card__header h2')).toContainText('of');

      // Sort should apply on top of the filter, not replace it. Compare the two seeded
      // games' relative order rather than assuming either is first overall — the real
      // collection may have its own games tied at the same rating.
      await page.locator('.sort-btn').click();
      await page.getByRole('button', { name: 'Highest rated' }).click();
      const highRow = page.locator('.grid-tile', { has: page.getByRole('button', { name: linkedTitle }) });
      const lowRow = page.locator('.grid-tile', { has: page.getByRole('button', { name: linkedLowRated }) });
      const highIndex = await highRow.evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
      const lowIndex = await lowRow.evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
      expect(highIndex).toBeLessThan(lowIndex);
      await expect(page.getByRole('button', { name: unlinkedTitle })).not.toBeVisible();

      await page.locator('.filter-btn').click();
      await page.getByRole('button', { name: 'Not linked', exact: true }).click();
      await expect(page.getByRole('button', { name: unlinkedTitle })).toBeVisible();
      await expect(page.getByRole('button', { name: linkedTitle })).not.toBeVisible();

      await page.locator('.filter-btn').click();
      await page.getByRole('button', { name: 'All games', exact: true }).click();
      await expect(page.getByRole('button', { name: linkedTitle })).toBeVisible();
      await expect(page.getByRole('button', { name: unlinkedTitle })).toBeVisible();
    } finally {
      await deleteGame(request, linkedId);
      await deleteGame(request, unlinkedId);
      await deleteGame(request, linkedLowId);
    }
  });
});

test.describe('Collection page bulk actions', () => {
  test.beforeEach(async ({ page }) => {
    // Bulk-select checkboxes exist in both views, but these tests assert against
    // list-view <tr>/<td> markup, so force it regardless of the grid default.
    await page.addInitScript(() => localStorage.setItem('collectionViewMode', 'list'));
  });

  test('selecting games shows the bulk bar, and bulk-delete removes all selected', async ({ page, request }) => {
    const titleA = e2eTitle('bulk delete a');
    const titleB = e2eTitle('bulk delete b');
    const idA = await seedGame(request, { title: titleA, minPlayers: 2, maxPlayers: 2 });
    const idB = await seedGame(request, { title: titleB, minPlayers: 2, maxPlayers: 2 });

    try {
      await page.goto('/collection');
      const rowA = page.locator('tr', { has: page.getByRole('button', { name: titleA }) });
      const rowB = page.locator('tr', { has: page.getByRole('button', { name: titleB }) });

      await rowA.locator('input[type="checkbox"]').check();
      await expect(page.locator('.bulk-bar')).toContainText('1 selected');

      await rowB.locator('input[type="checkbox"]').check();
      await expect(page.locator('.bulk-bar')).toContainText('2 selected');

      await page.getByRole('button', { name: 'Delete selected' }).click();
      await page.locator('dialog.modal', { hasText: 'Delete 2 games?' }).getByRole('button', { name: 'Delete' }).click();

      await expect(page.getByRole('button', { name: titleA })).not.toBeVisible();
      await expect(page.getByRole('button', { name: titleB })).not.toBeVisible();
      await expect(page.locator('.bulk-bar')).not.toBeVisible();
    } finally {
      await deleteGame(request, idA);
      await deleteGame(request, idB);
    }
  });

  test('bulk-tag adds a category to every selected game', async ({ page, request }) => {
    const tag = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const titleA = e2eTitle('bulk tag a');
    const titleB = e2eTitle('bulk tag b');
    const idA = await seedGame(request, { title: titleA, minPlayers: 2, maxPlayers: 2, categories: ['Strategy'] });
    const idB = await seedGame(request, { title: titleB, minPlayers: 2, maxPlayers: 2 });

    try {
      await page.goto('/collection');
      const rowA = page.locator('tr', { has: page.getByRole('button', { name: titleA }) });
      const rowB = page.locator('tr', { has: page.getByRole('button', { name: titleB }) });

      await rowA.locator('input[type="checkbox"]').check();
      await rowB.locator('input[type="checkbox"]').check();

      await page.locator('.bulk-bar__tag input').fill(tag);
      await page.locator('.bulk-bar__tag button', { hasText: 'Add tag' }).click();

      // Selection (and the bulk bar) stays open after tagging — only Clear/delete end it —
      // but the input clears once the tag has been applied to every selected game.
      await expect(page.locator('.bulk-bar__tag input')).toHaveValue('');

      // Verify server-side rather than the table (categories aren't shown in list view).
      const [gameA, gameB] = await Promise.all([
        request.get(`/api/games/${idA}`).then(r => r.json()),
        request.get(`/api/games/${idB}`).then(r => r.json()),
      ]);
      expect(gameA.categories).toContain(tag);
      expect(gameA.categories).toContain('Strategy');
      expect(gameB.categories).toContain(tag);
    } finally {
      await deleteGame(request, idA);
      await deleteGame(request, idB);
    }
  });

  test('select-all-visible checkbox selects and deselects every visible row', async ({ page, request }) => {
    const category = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const titleA = e2eTitle('select all a');
    const titleB = e2eTitle('select all b');
    const idA = await seedGame(request, { title: titleA, minPlayers: 2, maxPlayers: 2, categories: [category] });
    const idB = await seedGame(request, { title: titleB, minPlayers: 2, maxPlayers: 2, categories: [category] });

    try {
      await page.goto('/collection');
      const search = page.getByPlaceholder('Search title, categories, mechanics, notes, players, time, rating…');
      await search.fill(category);

      const headerCheckbox = page.locator('.th-select input[type="checkbox"]');
      await headerCheckbox.check();
      await expect(page.locator('.bulk-bar')).toContainText('2 selected');

      await headerCheckbox.uncheck();
      await expect(page.locator('.bulk-bar')).not.toBeVisible();
    } finally {
      await deleteGame(request, idA);
      await deleteGame(request, idB);
    }
  });
});

test.describe('Expansion warning', () => {
  test('an expansion missing its base game shows a warning badge and modal banner', async ({ page, request }) => {
    // The real dev collection has 40+ games — opening the detail modal also
    // kicks off a play-history fetch, so give this more headroom than the
    // 30s default rather than the (much smaller) BGG-dependent tests' budget.
    test.setTimeout(60_000);
    const title = e2eTitle('Seafarers');
    const id = await seedGame(request, {
      title,
      basedOnBggId: 999913,
      basedOnGameName: 'Base Game Not Owned'
    });

    try {
      await page.goto('/collection');
      await page.locator('.view-toggle__btn[title="Grid view"]').click();
      const tile = page.locator('.grid-tile', { has: page.getByRole('button', { name: title }) });
      await expect(tile).toBeVisible({ timeout: 15_000 });
      await expect(tile.locator('.expansion-badge')).toHaveClass(/tag--warning/, { timeout: 15_000 });
      await expect(tile.locator('.expansion-badge')).toContainText('Base Game Not Owned');

      await tile.getByRole('button', { name: title }).click();
      const dialog = page.locator('dialog.modal--detail');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.alert--error')).toContainText('Base Game Not Owned');
      await expect(dialog.locator('.alert--error')).toContainText("isn't in your collection");
    } finally {
      await deleteGame(request, id);
    }
  });

  test('an expansion whose base game is owned shows a neutral badge, no warning', async ({ page, request }) => {
    test.setTimeout(60_000);
    const baseTitle = e2eTitle('Base Owned');
    const baseId = await seedGame(request, { title: baseTitle, bggId: 999914 });
    const expansionTitle = e2eTitle('Expansion Owned Base');
    const expansionId = await seedGame(request, {
      title: expansionTitle,
      basedOnBggId: 999914,
      basedOnGameName: baseTitle
    });

    try {
      await page.goto('/collection');
      await page.locator('.view-toggle__btn[title="Grid view"]').click();
      const tile = page.locator('.grid-tile', { has: page.getByRole('button', { name: expansionTitle }) });
      await expect(tile).toBeVisible({ timeout: 15_000 });
      await expect(tile.locator('.expansion-badge')).not.toHaveClass(/tag--warning/, { timeout: 15_000 });
      await expect(tile.locator('.expansion-badge')).toHaveText('Expansion');

      await tile.getByRole('button', { name: expansionTitle }).click();
      const dialog = page.locator('dialog.modal--detail');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.alert--error')).toHaveCount(0);
      await expect(dialog.locator('.expansion-note')).toContainText(`Expansion for ${baseTitle}`);
    } finally {
      await deleteGame(request, expansionId);
      await deleteGame(request, baseId);
    }
  });

  test('a non-expansion game shows no expansion badge', async ({ page, request }) => {
    const title = e2eTitle('Not An Expansion');
    const id = await seedGame(request, { title });

    try {
      await page.goto('/collection');
      await page.locator('.view-toggle__btn[title="Grid view"]').click();
      const tile = page.locator('.grid-tile', { has: page.getByRole('button', { name: title }) });
      await expect(tile.locator('.expansion-badge')).toHaveCount(0);
    } finally {
      await deleteGame(request, id);
    }
  });
});

test.describe('Player count wording', () => {
  test('a solo-only game reads "1 player" in grid view, not "1–1 players" or "1 players"', async ({ page, request }) => {
    test.setTimeout(60_000);
    const solo = e2eTitle('Solo Only');
    const range = e2eTitle('Two To Four');
    const soloId = await seedGame(request, { title: solo, minPlayers: 1, maxPlayers: 1 });
    const rangeId = await seedGame(request, { title: range, minPlayers: 2, maxPlayers: 4 });

    try {
      await page.goto('/collection');
      await page.locator('.view-toggle__btn[title="Grid view"]').click();
      const soloMeta = page.locator('.grid-tile', { has: page.getByRole('button', { name: solo }) }).locator('.grid-tile__meta');
      await expect(soloMeta).toContainText('1 player', { timeout: 15_000 });
      await expect(soloMeta).not.toContainText('1 players');
      await expect(soloMeta).not.toContainText('1–1');

      const rangeMeta = page.locator('.grid-tile', { has: page.getByRole('button', { name: range }) }).locator('.grid-tile__meta');
      await expect(rangeMeta).toContainText('2–4 players');
    } finally {
      await deleteGame(request, soloId);
      await deleteGame(request, rangeId);
    }
  });
});
