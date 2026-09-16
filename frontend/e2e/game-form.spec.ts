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

  test('backend rejects an invalid player or time range even though the button-group UI cannot produce one', async ({ request }) => {
    // game-form.ts's onPlayerClick/onTimeClick can only ever produce min<=max ranges by
    // construction, so the only way to reach the invalid state Game.java now guards against
    // (see the 2026-09-14 validation fix) is a direct API call, as any non-UI client could send.
    const title = e2eTitle('bad range via api');
    const badPlayers = await request.post('/api/games', {
      data: { title: `${title} players`, minPlayers: 6, maxPlayers: 2, minPlayTimeMinutes: 30, maxPlayTimeMinutes: 60, categories: [], mechanics: [] }
    });
    expect(badPlayers.status()).toBe(400);

    const badTime = await request.post('/api/games', {
      data: { title: `${title} time`, minPlayers: 2, maxPlayers: 2, minPlayTimeMinutes: 90, maxPlayTimeMinutes: 30, categories: [], mechanics: [] }
    });
    expect(badTime.status()).toBe(400);
  });

  test('backend rejects an invalid range on update (PUT), not just create', async ({ request }) => {
    // The create-path check above doesn't prove update() re-validates — GameService.update()
    // merges fields onto an existing entity rather than constructing a fresh one, so this is
    // a genuinely separate code path worth covering on its own.
    const title = e2eTitle('bad range via put');
    const id = await seedGame(request, { title, minPlayers: 2, maxPlayers: 2, minPlayTimeMinutes: 30, maxPlayTimeMinutes: 60 });

    const response = await request.put(`/api/games/${id}`, {
      data: { title, minPlayers: 5, maxPlayers: 2, minPlayTimeMinutes: 30, maxPlayTimeMinutes: 60, categories: [], mechanics: [] }
    });
    expect(response.status()).toBe(400);

    await deleteGame(request, id);
  });

  test('shows a series suggestion when a similar title exists, and accepting it links both games', async ({ page, request }) => {
    const existingTitle = e2eTitle('Wordsmith Deluxe');
    const existingId = await seedGame(request, { title: existingTitle });

    await page.goto('/games/add');
    // Shares the significant word "Wordsmith" with the existing game's title.
    await page.getByPlaceholder('Game Title').fill(e2eTitle('Wordsmith Party'));
    await page.getByPlaceholder('Game Title').blur();

    const hint = page.locator('.series-hint');
    await expect(hint).toBeVisible({ timeout: 2000 });
    await expect(hint).toContainText(existingTitle);

    const seriesName = e2eTitle('Wordsmith Series');
    await page.locator('.series-hint__name-input').fill(seriesName);
    await hint.getByRole('button', { name: 'Yes' }).click();
    await expect(hint).not.toBeVisible();
    await expect(page.getByPlaceholder('e.g. Fluxx, Pandemic')).toHaveValue(seriesName);

    await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('group', { name: 'Play time' }).getByRole('button', { name: '30m', exact: true }).click();
    await page.getByRole('button', { name: 'Save game' }).click();
    await expect(page).toHaveURL(/\/collection/);

    // The existing game should have picked up the same series name as a side effect.
    const updated = await (await request.get(`/api/games/${existingId}`)).json();
    expect(updated.seriesName).toBe(seriesName);

    await deleteGame(request, existingId);
  });

  test('warns about a duplicate title and links to the existing game', async ({ page, request }) => {
    const title = e2eTitle('Exact Duplicate');
    const existingId = await seedGame(request, { title });

    await page.goto('/games/add');
    await page.getByPlaceholder('Game Title').fill(title);
    await page.getByPlaceholder('Game Title').blur();

    const warning = page.locator('.duplicate-warning');
    await expect(warning).toBeVisible({ timeout: 2000 });
    await expect(warning).toContainText(title);

    await warning.getByRole('button', { name: 'Dismiss' }).click();
    await expect(warning).not.toBeVisible();

    await deleteGame(request, existingId);
  });

  test('custom category tags support add/rename/cancel-rename/remove, and only the survivors persist through save', async ({ page, request }) => {
    const title = e2eTitle('custom tag flow');
    const customCategory = `Homebrew ${Math.random().toString(36).slice(2, 6)}`;
    const toBeRemoved = `Discarded ${Math.random().toString(36).slice(2, 6)}`;

    await page.goto('/games/add');
    await page.getByPlaceholder('Game Title').fill(title);
    await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('group', { name: 'Play time' }).getByRole('button', { name: '30m', exact: true }).click();

    const input = page.getByPlaceholder('Search or add category…');
    for (const name of [customCategory, toBeRemoved]) {
      await input.fill(name);
      const addOption = page.getByRole('option', { name: `Add "${name}"` });
      await expect(addOption).toBeVisible();
      await addOption.click();
    }

    const customTag = page.locator('.custom-tag-item', { hasText: customCategory });
    await expect(customTag).toBeVisible();

    // Start a rename, then cancel with Escape — the name should be unchanged.
    await customTag.getByTitle('Rename').click();
    await page.locator('.custom-tag-input').fill('Should Not Stick');
    await page.locator('.custom-tag-input').press('Escape');
    await expect(page.locator('.custom-tag-item', { hasText: customCategory })).toBeVisible();
    await expect(page.getByText('Should Not Stick')).not.toBeVisible();

    // Rename it for real, this time confirming with Enter.
    const renamed = `${customCategory} Renamed`;
    await customTag.getByTitle('Rename').click();
    await page.locator('.custom-tag-input').fill(renamed);
    await page.locator('.custom-tag-input').press('Enter');
    await expect(page.locator('.custom-tag-item', { hasText: renamed })).toBeVisible();

    // Remove the other tag entirely before saving.
    await page.locator('.custom-tag-item', { hasText: toBeRemoved }).getByTitle('Remove').click();
    await expect(page.getByText(toBeRemoved)).not.toBeVisible();

    // Save and confirm the backend actually persisted the renamed tag and never saw the
    // removed one — not just the in-memory draft.
    await page.getByRole('button', { name: 'Save game' }).click();
    await expect(page).toHaveURL(/\/collection/);
    const games = await (await request.get('/api/games')).json();
    const saved = games.find((g: { title: string }) => g.title === title);
    expect(saved).toBeTruthy();
    expect(saved.categories).toContain(renamed);
    expect(saved.categories).not.toContain(toBeRemoved);
    expect(saved.categories).not.toContain(customCategory);

    await deleteGame(request, saved.id);
  });

  test('complexity button group selects a value and its info dialog opens', async ({ page }) => {
    await page.goto('/games/add');
    const complexity = page.getByRole('group', { name: 'Complexity' });
    await complexity.getByRole('button', { name: '4', exact: true }).click();
    await expect(complexity.getByRole('button', { name: '4', exact: true })).toHaveClass(/selected/);
    await expect(page.locator('.field', { hasText: 'Complexity' })).toContainText('Heavy');

    await page.getByRole('button', { name: 'Complexity help' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('shows an error instead of a blank form when editing a nonexistent game', async ({ page }) => {
    await page.goto('/games/999999999/edit');
    // The exact backend message, not just "some alert" — see GameNotFoundException.
    await expect(page.getByRole('alert')).toHaveText('Game not found: 999999999');
  });

  test('BGG search shows "no matches" for a query nothing could match', async ({ page }) => {
    // A random gibberish string is guaranteed empty regardless of whether a real
    // BGG_API_TOKEN is configured — unlike searching a real game name, this doesn't
    // depend on this environment's token status to mean the same thing either way.
    await page.goto('/games/add');
    const gibberish = `zzznomatch${Math.random().toString(36).slice(2, 10)}`;
    await page.getByPlaceholder('Search BoardGameGeek by name…').fill(gibberish);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No matches on BoardGameGeek.')).toBeVisible();
  });

  test('BGG import fills in title, players, time, complexity, categories, mechanics, and notes from a real result', async ({ page, request }) => {
    // Only meaningful with a real BGG_API_TOKEN configured (see backend/.env) — without
    // one, every search returns empty and there's no result to import. Skip rather than
    // assert either behavior is "the" correct one for an environment that hasn't set it up.
    const probe = await request.get('/api/bgg/search?q=catan');
    const hits = await probe.json();
    test.skip(hits.length === 0, 'No BGG_API_TOKEN configured in this environment — see backend/.env.');

    await page.goto('/games/add');
    await page.getByPlaceholder('Search BoardGameGeek by name…').fill('catan');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    // Matches "Catan" (1995) itself, not a variant/expansion whose name merely starts with it.
    const option = page.getByRole('option', { name: /^Catan\s/ }).first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(page.locator('.bgg-import__confirm')).toContainText('Catan');
    await expect(page.getByPlaceholder('Game Title')).toHaveValue('Catan');
    await expect(page.locator('.field', { hasText: 'Players' })).toContainText('3–4');
    await expect(page.locator('.field', { hasText: 'Play time' })).toContainText('1h');
    await expect(page.locator('.field', { hasText: 'Complexity' })).not.toContainText('optional');
    // "Negotiation" exists as both a category and a mechanic for Catan — scope to one.
    await expect(
      page.locator('.field', { hasText: 'Categories' }).getByRole('button', { name: 'Negotiation', exact: true })
    ).toHaveClass(/selected/);

    // The long-form BGG description should have prefilled Notes (see decodeBggDescription) —
    // real text, not raw HTML entities/tags left undecoded.
    const notes = await page.locator('textarea[name="notes"]').inputValue();
    expect(notes.toLowerCase()).toContain('catan');
    expect(notes).not.toMatch(/&[a-z#0-9]+;/i);
    expect(notes).not.toMatch(/<[a-z][^>]*>/i);
  });

  test('BGG import never overwrites notes you already typed yourself', async ({ page, request }) => {
    const probe = await request.get('/api/bgg/search?q=catan');
    const hits = await probe.json();
    test.skip(hits.length === 0, 'No BGG_API_TOKEN configured in this environment — see backend/.env.');

    await page.goto('/games/add');
    const myNotes = 'My own pre-existing note.';
    await page.locator('textarea[name="notes"]').fill(myNotes);

    await page.getByPlaceholder('Search BoardGameGeek by name…').fill('catan');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('option', { name: /^Catan\s/ }).first().click();
    await expect(page.locator('.bgg-import__confirm')).toBeVisible();

    await expect(page.locator('textarea[name="notes"]')).toHaveValue(myNotes);
  });

  test('edit mode lets you mark a play removed and restore it before saving', async ({ page, request }) => {
    const title = e2eTitle('play history edit');
    const id = await seedGame(request, { title, minPlayers: 2, maxPlayers: 2 });
    const playResponse = await request.post(`/api/games/${id}/plays`, { data: {} });
    expect(playResponse.ok()).toBeTruthy();

    await page.goto(`/games/${id}/edit`);
    const historyItem = page.locator('.play-history-item').first();
    await expect(historyItem).toBeVisible();
    await expect(historyItem).not.toHaveClass(/pending/);

    await historyItem.getByTitle('Remove this play').click();
    await expect(historyItem).toHaveClass(/pending/);
    await expect(historyItem).toContainText('removed on save');

    // Restoring before save should undo the pending removal.
    await historyItem.getByTitle('Restore this play').click();
    await expect(historyItem).not.toHaveClass(/pending/);

    // Remove again and actually save — the play should be gone for good.
    await historyItem.getByTitle('Remove this play').click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/collection/);

    const plays = await (await request.get(`/api/games/${id}/plays`)).json();
    expect(plays).toHaveLength(0);

    await deleteGame(request, id);
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
    // td order: Title, Players, Time, Complexity, Plays, Last Played, Personal Rating, actions.
    await expect(row.locator('td').nth(6)).toHaveText('9');

    await deleteGame(request, id);
  });
});
