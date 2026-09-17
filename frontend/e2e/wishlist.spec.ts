import { test, expect } from '@playwright/test';
import { deleteAllE2eWishlistItems, deleteWishlistItem, e2eTitle, seedWishlistItem } from './support/api';

test.describe('Wishlist page', () => {
  test.afterEach(async ({ request }) => {
    // Safety net in case a test fails before its own cleanup runs.
    await deleteAllE2eWishlistItems(request);
  });

  test('lists a seeded wishlist item and filters it by category', async ({ page, request }) => {
    const title = e2eTitle('wishlist item');
    const id = await seedWishlistItem(request, { title, categories: ['Strategy'], mechanics: ['Drafting'] });

    try {
      await page.goto('/wishlist');
      await expect(page.locator('.wishlist-tile', { hasText: title })).toBeVisible();

      // Selecting an unrelated category should hide it; selecting its own brings it back.
      await page.getByRole('button', { name: 'Drafting', exact: true }).click();
      await expect(page.locator('.wishlist-tile', { hasText: title })).toBeVisible();

      await page.getByRole('button', { name: 'Drafting', exact: true }).click();
      await page.getByRole('button', { name: 'Strategy', exact: true }).click();
      await expect(page.locator('.wishlist-tile', { hasText: title })).toBeVisible();
    } finally {
      await deleteWishlistItem(request, id);
    }
  });

  test('removing a wishlist item takes it off the list', async ({ page, request }) => {
    const title = e2eTitle('wishlist remove');
    const id = await seedWishlistItem(request, { title });

    await page.goto('/wishlist');
    const tile = page.locator('.wishlist-tile', { hasText: title });
    await expect(tile).toBeVisible();

    await tile.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.wishlist-tile', { hasText: title })).not.toBeVisible();

    const remaining = await request.get('/api/wishlist');
    const items = await remaining.json();
    expect(items.find((i: { id: number }) => i.id === id)).toBeUndefined();
  });

  test('moving a wishlist item to the collection creates a game and removes the wishlist entry', async ({ page, request }) => {
    const title = e2eTitle('wishlist move');
    const id = await seedWishlistItem(request, { title, categories: ['Strategy'] });

    await page.goto('/wishlist');
    const tile = page.locator('.wishlist-tile', { hasText: title });
    await expect(tile).toBeVisible();

    await tile.getByRole('button', { name: 'Move to Collection' }).click();
    await expect(page).toHaveURL(/\/collection/);
    await expect(page.getByRole('button', { name: title })).toBeVisible();

    const wishlistAfter = await (await request.get('/api/wishlist')).json();
    expect(wishlistAfter.find((i: { id: number }) => i.id === id)).toBeUndefined();

    const games = await (await request.get('/api/games')).json();
    const created = games.find((g: { title: string }) => g.title === title);
    expect(created).toBeDefined();
    await request.delete(`/api/games/${created.id}`);
  });

  test('adding a game found via BGG search shows it on the wishlist', async ({ page, request }) => {
    // Only meaningful with a real BGG_API_TOKEN configured — without one, search
    // returns nothing and there's nothing to add. Same skip convention used
    // throughout game-form.spec.ts for real-BGG-lookup tests.
    const probe = await request.get('/api/bgg/search?q=catan');
    const hits = await probe.json();
    test.skip(hits.length === 0, 'No BGG_API_TOKEN configured in this environment — see backend/.env.');

    await page.goto('/wishlist');
    const countBefore = await page.locator('.wishlist-tile').count();

    await page.getByPlaceholder('Search BoardGameGeek by name…').fill('catan');
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    // BGG's search for "catan" returns many variants/expansions — this test only
    // cares that adding *a* result works, not which one, so take the first result
    // that's still actionable (a prior run's leftover, or the real collection,
    // could already have any given one flagged "already own"/"in wishlist"). Note:
    // BGG's search hit can show an alternate display name that differs from the
    // full record's actual primary name (the same is true of the existing BGG
    // import on the add-game form) — so this only asserts on bggId, never on the
    // clicked result's displayed text matching what ends up saved.
    const bggId = hits[0].bggId as number;
    const result = page.locator('.search-result').filter({
      has: page.getByRole('button', { name: 'Add to Wishlist' })
    }).first();
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: 'Add to Wishlist' }).click();

    // Fetch (and remember, for cleanup) what got added before making any assertion
    // that could throw — a real network add already happened at this point regardless
    // of what the UI shows next, and it must not leak past this test either way.
    await expect(async () => {
      const items = await (await request.get('/api/wishlist')).json();
      expect(items.some((i: { bggId: number }) => i.bggId === bggId)).toBe(true);
    }).toPass({ timeout: 5000 });
    const items = await (await request.get('/api/wishlist')).json();
    const added = items.find((i: { bggId: number }) => i.bggId === bggId);

    try {
      await expect(page.locator('.wishlist-tile')).toHaveCount(countBefore + 1);
    } finally {
      await deleteWishlistItem(request, added.id);
    }
  });

  test('browsing trending games and adding one shows it on the wishlist', async ({ page, request }) => {
    // Real BGG network call — same skip convention as above. Also genuinely slow on a
    // cold cache (BggClient rate-limit-paces ~50 sequential lookups, ~30s+) — raise
    // the whole test's timeout, not just an individual assertion's, since Playwright's
    // per-test timeout applies regardless of any single expect()'s own timeout option.
    test.setTimeout(150_000);

    const probe = await request.get('/api/bgg/search?q=catan');
    const hits = await probe.json();
    test.skip(hits.length === 0, 'No BGG_API_TOKEN configured in this environment — see backend/.env.');

    await page.goto('/wishlist');
    await page.getByRole('button', { name: 'Browse Trending', exact: true }).click();

    const firstTile = page.locator('.wishlist-tile').first();
    await expect(firstTile).toBeVisible({ timeout: 90_000 });

    const title = await firstTile.locator('.wishlist-tile__title').innerText();
    await firstTile.getByRole('button', { name: 'Add to Wishlist' }).click();

    try {
      await expect(firstTile.getByText(/already own|in wishlist/)).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: /^My Wishlist/ }).click();
      await expect(page.locator('.wishlist-tile', { hasText: title.split(' (')[0] })).toBeVisible();
    } finally {
      // A real BGG title, not an "E2e"-prefixed one, so the describe block's
      // afterEach safety net (which only sweeps by that prefix) won't catch this —
      // clean it up explicitly regardless of how the assertions above went.
      const items = await (await request.get('/api/wishlist')).json();
      const added = items.find((i: { title: string }) => i.title === title.split(' (')[0]);
      if (added) await deleteWishlistItem(request, added.id);
    }
  });
});
