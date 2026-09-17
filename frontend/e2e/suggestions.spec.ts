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

  test('other presets fill in their matching criteria', async ({ page }) => {
    await page.goto('/suggest');
    const presets = page.locator('.presets');

    // Quick game: { minPlayers: 4, maxPlayers: 4, maxMinutes: 30 }
    await presets.getByRole('button', { name: 'Quick game', exact: true }).click();
    await expect(
      page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '4', exact: true })
    ).toHaveClass(/selected/);
    await expect(page.locator('.field', { hasText: 'Play time' })).toContainText('up to 30m');

    // Party: { minPlayers: 6, maxPlayers: 6 }
    await presets.getByRole('button', { name: 'Party', exact: true }).click();
    await expect(
      page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '6', exact: true })
    ).toHaveClass(/selected/);

    // New to me: { minPlayers: 2, maxPlayers: 2, unplayedOnly: true }
    await presets.getByRole('button', { name: 'New to me', exact: true }).click();
    await expect(
      page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true })
    ).toHaveClass(/selected/);
    await expect(page.getByRole('button', { name: '● Unplayed only' })).toBeVisible();

    // Top picks: { minPlayers: 4, maxPlayers: 4, minRating: 7 }
    await presets.getByRole('button', { name: 'Top picks', exact: true }).click();
    await expect(page.locator('.field', { hasText: 'Min rating' })).toContainText('7+ / 10');
  });

  test('favorites-only and unplayed-only toggles affect results', async ({ page, request }) => {
    const category = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const favoriteTitle = e2eTitle('favorite pick');
    const playedTitle = e2eTitle('already played');
    const favoriteId = await seedGame(request, {
      title: favoriteTitle, minPlayers: 2, maxPlayers: 2, categories: [category], favorite: true
    });
    const playedId = await seedGame(request, {
      title: playedTitle, minPlayers: 2, maxPlayers: 2, categories: [category]
    });
    // Log a play so this one fails the "unplayed only" filter.
    await request.post(`/api/games/${playedId}/plays`, { data: {} });

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: category, exact: true }).click();

      await page.getByRole('button', { name: '☆ Favorites only' }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();
      await expect(page.locator('li.suggestion', { hasText: favoriteTitle })).toBeVisible();
      await expect(page.locator('li.suggestion', { hasText: playedTitle })).not.toBeVisible();

      // Switch to unplayed-only instead of favorites-only.
      await page.getByRole('button', { name: '★ Favorites only' }).click();
      await page.getByRole('button', { name: '○ Unplayed only' }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();
      await expect(page.locator('li.suggestion', { hasText: playedTitle })).not.toBeVisible();
      await expect(page.locator('li.suggestion', { hasText: favoriteTitle })).toBeVisible();
    } finally {
      await deleteGame(request, favoriteId);
      await deleteGame(request, playedId);
    }
  });

  test('min-rating criteria excludes lower-rated games', async ({ page, request }) => {
    const category = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const lowRatedTitle = e2eTitle('low rated');
    const highRatedTitle = e2eTitle('high rated');
    const lowId = await seedGame(request, {
      title: lowRatedTitle, minPlayers: 2, maxPlayers: 2, categories: [category], personalRating: 3
    });
    const highId = await seedGame(request, {
      title: highRatedTitle, minPlayers: 2, maxPlayers: 2, categories: [category], personalRating: 9
    });

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: category, exact: true }).click();
      await page.getByRole('group', { name: 'Minimum personal rating' }).getByRole('button', { name: '7', exact: true }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();

      await expect(page.locator('li.suggestion', { hasText: highRatedTitle })).toBeVisible();
      await expect(page.locator('li.suggestion', { hasText: lowRatedTitle })).not.toBeVisible();
    } finally {
      await deleteGame(request, lowId);
      await deleteGame(request, highId);
    }
  });

  test('max-play-count criteria excludes games played more than that many times', async ({ page, request }) => {
    const category = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const unplayedTitle = e2eTitle('rarely played');
    const oftenPlayedTitle = e2eTitle('often played');
    const unplayedId = await seedGame(request, {
      title: unplayedTitle, minPlayers: 2, maxPlayers: 2, categories: [category]
    });
    const oftenPlayedId = await seedGame(request, {
      title: oftenPlayedTitle, minPlayers: 2, maxPlayers: 2, categories: [category]
    });
    // Give the second game 2 logged plays so a "max 1 play" filter excludes it.
    await request.post(`/api/games/${oftenPlayedId}/plays`, { data: {} });
    await request.post(`/api/games/${oftenPlayedId}/plays`, { data: {} });

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: category, exact: true }).click();
      await page.getByRole('group', { name: 'Max play count' }).getByRole('button', { name: '1×', exact: true }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();

      await expect(page.locator('li.suggestion', { hasText: unplayedTitle })).toBeVisible();
      await expect(page.locator('li.suggestion', { hasText: oftenPlayedTitle })).not.toBeVisible();
    } finally {
      await deleteGame(request, unplayedId);
      await deleteGame(request, oftenPlayedId);
    }
  });

  test('a selected category chip is marked stale once criteria narrow it out, and pagination shows more results', async ({ page, request }) => {
    const catA = `ZZZ_E2E_A_${Math.random().toString(36).slice(2, 6)}`;
    const catB = `ZZZ_E2E_B_${Math.random().toString(36).slice(2, 6)}`;
    const idA = await seedGame(request, { title: e2eTitle('two player'), minPlayers: 2, maxPlayers: 2, categories: [catA] });
    const idB = await seedGame(request, { title: e2eTitle('six player'), minPlayers: 6, maxPlayers: 6, categories: [catB] });

    try {
      await page.goto('/suggest');
      const catBChip = page.getByRole('button', { name: catB, exact: true });
      await expect(catBChip).not.toHaveClass(/stale/);
      await catBChip.click();
      await expect(catBChip).toHaveClass(/selected/);

      // Narrowing to 2 players excludes the 6-player game entirely — its category
      // chip should now be flagged stale even though it's still selected.
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
      await expect(catBChip).toHaveClass(/selected/);
      await expect(catBChip).toHaveClass(/stale/);
    } finally {
      await deleteGame(request, idA);
      await deleteGame(request, idB);
    }
  });

  test('pagination shows a "Show more" button and loads the next page', async ({ page, request }) => {
    const category = `ZZZ_E2E_PAGE_${Math.random().toString(36).slice(2, 6)}`;
    const ids: number[] = [];
    for (let i = 0; i < 11; i++) {
      ids.push(await seedGame(request, { title: e2eTitle(`page game ${i}`), minPlayers: 2, maxPlayers: 2, categories: [category] }));
    }

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: category, exact: true }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();

      await expect(page.locator('li.suggestion')).toHaveCount(10);
      const showMore = page.getByRole('button', { name: /Show 10 more/ });
      await expect(showMore).toBeVisible();
      await expect(showMore).toContainText('1 remaining');

      await showMore.click();
      await expect(page.locator('li.suggestion')).toHaveCount(11);
      await expect(showMore).not.toBeVisible();
    } finally {
      await Promise.all(ids.map((id) => deleteGame(request, id)));
    }
  });

  test('shows an empty-results message when nothing matches', async ({ page }) => {
    // "Very Heavy" complexity finishing in 15 minutes or less is a contradiction
    // in practice — no seeding needed, this shouldn't match real collection data
    // either (unlike a category/mechanic chip filter, these hard criteria aren't
    // stripped as "stale" before submission, so the constraint always applies).
    await page.goto('/suggest');
    await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('group', { name: 'Play time' }).getByRole('button', { name: '15m', exact: true }).click();
    await page.getByRole('group', { name: 'Complexity' }).getByRole('button', { name: '5', exact: true }).click();
    await page.getByRole('button', { name: 'Suggest' }).click();
    await expect(page.getByText(/Nothing in your collection fits/)).toBeVisible();
  });

  test('result detail modal shows full info and supports log play from within it', async ({ page, request }) => {
    const category = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const title = e2eTitle('modal detail game');
    const id = await seedGame(request, {
      title, minPlayers: 2, maxPlayers: 4, categories: [category], mechanics: ['Hand Management'], personalRating: 6
    });

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: category, exact: true }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();

      const result = page.locator('li.suggestion', { hasText: title });
      await result.getByRole('button', { name: title }).click();

      const dialog = page.locator('dialog.modal--detail');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
      await expect(dialog).toContainText('6 / 10');
      await expect(dialog.locator('.tag', { hasText: category })).toBeVisible();

      await dialog.getByRole('button', { name: 'Log play' }).click();
      await expect(dialog.getByRole('button', { name: '✓ Logged!' })).toBeVisible();
      // The list behind the modal should reflect it too once closed.
      await dialog.locator('.modal__footer').getByRole('button', { name: 'Close' }).click();
      await expect(result.getByRole('button', { name: '✓ Logged!' })).toBeVisible();
    } finally {
      await deleteGame(request, id);
    }
  });

  test('results are ranked by score (rating bonus), not just alphabetically or insertion order', async ({ page, request }) => {
    // Both unplayed (equal variety bonus), so score is driven entirely by personalRating —
    // the higher-rated game must rank first even though its title sorts after the other's.
    const category = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const aTitleLowRating = e2eTitle('Aaa Low Rated');
    const zTitleHighRating = e2eTitle('Zzz High Rated');
    const lowId = await seedGame(request, { title: aTitleLowRating, minPlayers: 2, maxPlayers: 2, categories: [category], personalRating: 2 });
    const highId = await seedGame(request, { title: zTitleHighRating, minPlayers: 2, maxPlayers: 2, categories: [category], personalRating: 10 });

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: category, exact: true }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();

      const items = page.locator('li.suggestion');
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText(zTitleHighRating);
      await expect(items.nth(1)).toContainText(aTitleLowRating);
      // The rank badge and score should reflect the ordering too, not just DOM position.
      await expect(items.nth(0).locator('.suggestion__rank')).toHaveText('1');
      await expect(items.nth(1).locator('.suggestion__rank')).toHaveText('2');
    } finally {
      await deleteGame(request, lowId);
      await deleteGame(request, highId);
    }
  });

  test('series filter narrows results to games in the selected series', async ({ page, request }) => {
    const seriesA = e2eTitle('Series Alpha');
    const seriesB = e2eTitle('Series Beta');
    const inSeriesTitle = e2eTitle('in series alpha');
    const otherSeriesTitle = e2eTitle('in series beta');
    const inId = await seedGame(request, { title: inSeriesTitle, minPlayers: 2, maxPlayers: 2, seriesName: seriesA });
    const otherId = await seedGame(request, { title: otherSeriesTitle, minPlayers: 2, maxPlayers: 2, seriesName: seriesB });

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();

      const seriesField = page.locator('.field', { hasText: 'Series' });
      await expect(seriesField.getByRole('button', { name: seriesA, exact: true })).toBeVisible();
      await seriesField.getByRole('button', { name: seriesA, exact: true }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();

      await expect(page.locator('li.suggestion', { hasText: inSeriesTitle })).toBeVisible();
      await expect(page.locator('li.suggestion', { hasText: otherSeriesTitle })).not.toBeVisible();
    } finally {
      await deleteGame(request, inId);
      await deleteGame(request, otherId);
    }
  });

  test('shows an error banner when the suggest request fails', async ({ page }) => {
    await page.route('**/api/suggestions', (route) => {
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated suggestion failure' }) });
    });

    await page.goto('/suggest');
    await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('button', { name: 'Suggest' }).click();

    await expect(page.getByRole('alert')).toHaveText('Simulated suggestion failure');
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

  test('a game BGG marks "best" for the requested player count is ranked above one that is not', async ({ page, request }) => {
    const category = `ZZZ_E2E_${Math.random().toString(36).slice(2, 8)}`;
    const bestTitle = e2eTitle('best with four');
    const otherTitle = e2eTitle('also fits four');
    const bestId = await seedGame(request, {
      title: bestTitle, minPlayers: 2, maxPlayers: 4, categories: [category], bestPlayerCounts: [4]
    });
    const otherId = await seedGame(request, {
      title: otherTitle, minPlayers: 2, maxPlayers: 4, categories: [category], bestPlayerCounts: [2]
    });

    try {
      await page.goto('/suggest');
      await page.getByRole('group', { name: 'Player count' }).getByRole('button', { name: '4', exact: true }).click();
      await page.getByRole('button', { name: category, exact: true }).click();
      await page.getByRole('button', { name: 'Suggest' }).click();

      const bestResult = page.locator('li.suggestion', { hasText: bestTitle });
      const otherResult = page.locator('li.suggestion', { hasText: otherTitle });
      await expect(bestResult).toBeVisible();
      await expect(otherResult).toBeVisible();
      await expect(bestResult).toContainText('Best with 4 players');

      // Both games are otherwise identical, so the "best with 4" bonus should
      // rank bestTitle strictly ahead of otherTitle in the results list.
      const titles = await page.locator('li.suggestion .suggestion__title').allTextContents();
      const bestIndex = titles.findIndex((t) => t.includes(bestTitle));
      const otherIndex = titles.findIndex((t) => t.includes(otherTitle));
      expect(bestIndex).toBeGreaterThanOrEqual(0);
      expect(otherIndex).toBeGreaterThanOrEqual(0);
      expect(bestIndex).toBeLessThan(otherIndex);
    } finally {
      await deleteGame(request, bestId);
      await deleteGame(request, otherId);
    }
  });
});
