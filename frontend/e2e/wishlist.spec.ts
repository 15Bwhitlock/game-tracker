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

  test('clicking a wishlist tile opens a detail modal with full info', async ({ page, request }) => {
    const title = e2eTitle('wishlist detail');
    const id = await seedWishlistItem(request, {
      title,
      categories: ['Strategy'],
      mechanics: ['Drafting'],
      notes: 'Heard great things about this one',
      minPlayers: 2,
      maxPlayers: 4,
      minPlayTimeMinutes: 30,
      maxPlayTimeMinutes: 60,
      complexityWeight: 2.5
    });

    try {
      await page.goto('/wishlist');
      const tile = page.locator('.wishlist-tile', { hasText: title });
      await expect(tile).toBeVisible();

      await tile.getByRole('button', { name: title }).click();
      const dialog = page.locator('dialog.modal--detail');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
      await expect(dialog).toContainText('2–4');
      await expect(dialog).toContainText('2.5 / 5');
      await expect(dialog.locator('.tag', { hasText: 'Strategy' })).toBeVisible();
      await expect(dialog.locator('.tag', { hasText: 'Drafting' })).toBeVisible();
      await expect(dialog).toContainText('Heard great things about this one');

      // Clicking the cover image opens the same modal. (Both the × icon and the
      // footer button are named "Close" — the × uses aria-label, so scope to the footer.)
      await dialog.locator('.modal__footer').getByRole('button', { name: 'Close' }).click();
      await expect(dialog).not.toBeVisible();
      await tile.locator('.wishlist-tile__cover').click();
      await expect(dialog).toBeVisible();

      // Remove works from inside the modal too, and closes it.
      await dialog.getByRole('button', { name: 'Remove' }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.locator('.wishlist-tile', { hasText: title })).not.toBeVisible();
    } finally {
      await deleteWishlistItem(request, id);
    }
  });

  test('adding and editing a note on a wishlist item from the detail modal', async ({ page, request }) => {
    const title = e2eTitle('wishlist notes');
    const id = await seedWishlistItem(request, { title });

    try {
      await page.goto('/wishlist');
      const tile = page.locator('.wishlist-tile', { hasText: title });
      await expect(tile).toBeVisible();

      await tile.locator('.title-btn').click();
      const dialog = page.locator('dialog.modal--detail');
      await expect(dialog).toBeVisible();

      // No note yet — the icon button offers to add one.
      await dialog.getByTitle('Add a note').click();
      await dialog.locator('textarea').fill('Great with the expansion');
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog.locator('.detail-notes')).toHaveText('Great with the expansion');

      // Editing an existing note pre-fills the textarea with the current value.
      await dialog.getByTitle('Edit note').click();
      await expect(dialog.locator('textarea')).toHaveValue('Great with the expansion');
      await dialog.locator('textarea').fill('Actually skip the expansion');
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog.locator('.detail-notes')).toHaveText('Actually skip the expansion');

      // The note only shows inside the modal — the tile itself stays clean, and
      // reopening it confirms the update persisted rather than just being local state.
      await dialog.locator('.modal__footer').getByRole('button', { name: 'Close' }).click();
      await expect(tile).not.toContainText('Actually skip the expansion');
      await tile.locator('.title-btn').click();
      await expect(dialog.locator('.detail-notes')).toHaveText('Actually skip the expansion');
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

    await tile.getByRole('button', { name: 'Remove', exact: true }).click();
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

  test('viewing a BGG search result opens its detail before adding it', async ({ page, request }) => {
    // Real BGG network call — same skip convention as the other search-dependent tests.
    const probe = await request.get('/api/bgg/search?q=catan');
    const hits = await probe.json();
    test.skip(hits.length === 0, 'No BGG_API_TOKEN configured in this environment — see backend/.env.');

    await page.goto('/wishlist');
    await page.getByPlaceholder('Search BoardGameGeek by name…').fill('catan');
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    // Same "first actionable result" reasoning as the other search test — a prior
    // run's leftover, or the real collection, could flag any given hit already.
    const result = page.locator('.search-result').filter({
      has: page.getByRole('button', { name: 'Add to Wishlist' })
    }).first();
    await expect(result).toBeVisible();

    await result.locator('.title-btn').click();
    const dialog = page.locator('dialog.modal--detail');
    await expect(dialog).toBeVisible();
    // The modal fetched the full record — the "Notes" section only ever renders
    // for items already on the wishlist, so it must be absent for a pre-add preview.
    await expect(dialog.locator('.detail-label', { hasText: 'Notes' })).toHaveCount(0);
    // BGG's own blurb is shown instead, as real decoded text (see decodeBggDescription) —
    // not raw HTML entities/tags left undecoded.
    await expect(dialog.locator('.detail-label', { hasText: 'Description' })).toBeVisible();
    const description = await dialog.locator('.detail-description').innerText();
    expect(description.length).toBeGreaterThan(0);
    expect(description).not.toMatch(/&[a-z#0-9]+;/i);
    expect(description).not.toMatch(/<[a-z][^>]*>/i);

    // Adding straight from the preview works, and closes out to the updated list.
    await dialog.getByRole('button', { name: 'Add to Wishlist' }).click();
    await expect(dialog.getByText(/already own|in wishlist/)).toBeVisible({ timeout: 10_000 });

    const items = await (await request.get('/api/wishlist')).json();
    const title = await dialog.locator('h2').innerText();
    const added = items.find((i: { title: string }) => title.startsWith(i.title));
    expect(added).toBeDefined();
    // The description that was just previewed becomes the item's (editable) notes.
    expect(added.notes).toBe(description);

    await dialog.locator('.modal__footer').getByRole('button', { name: 'Close' }).click();
    if (added) await deleteWishlistItem(request, added.id);
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

    // The trending list can include games this run's real collection/wishlist
    // already has flagged "already own"/"in wishlist" (no "Add to Wishlist" button
    // on those tiles) — same reasoning as the BGG-search test above: only the
    // first *actionable* tile matters, not literally the first one. This filtered
    // locator is re-evaluated live on every query, so it's only used up to the
    // click — once the button it filters on disappears, it stops matching anything.
    const actionableTile = page.locator('.wishlist-tile').filter({
      has: page.getByRole('button', { name: 'Add to Wishlist' })
    }).first();
    await expect(actionableTile).toBeVisible({ timeout: 90_000 });

    // Trending cards aren't wishlisted yet, so their detail modal shows BGG's own
    // description rather than a personal note — same as the search-preview modal.
    await actionableTile.locator('.title-btn').click();
    const dialog = page.locator('dialog.modal--detail');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.detail-label', { hasText: 'Description' })).toBeVisible();
    await expect(dialog.locator('.detail-description')).not.toBeEmpty();
    await dialog.locator('.modal__footer').getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();

    // .title-btn holds just the game's name — the sibling year span (e.g. "(2024)")
    // would otherwise get pulled into a plain .wishlist-tile__title innerText read.
    // Captured before the click and used afterward: a title-based locator stays
    // valid once the tile's "Add to Wishlist" button (and so actionableTile) is gone.
    const title = await actionableTile.locator('.title-btn').innerText();
    const tile = page.locator('.wishlist-tile').filter({ has: page.locator('.title-btn', { hasText: title, exact: true }) });
    await actionableTile.getByRole('button', { name: 'Add to Wishlist' }).click();

    try {
      await expect(tile.getByText(/already own|in wishlist/)).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: /^My Wishlist/ }).click();
      await expect(page.locator('.wishlist-tile').filter({ has: page.locator('.title-btn', { hasText: title, exact: true }) })).toBeVisible();
    } finally {
      // A real BGG title, not an "E2e"-prefixed one, so the describe block's
      // afterEach safety net (which only sweeps by that prefix) won't catch this —
      // clean it up explicitly regardless of how the assertions above went.
      const items = await (await request.get('/api/wishlist')).json();
      const added = items.find((i: { title: string }) => i.title === title);
      if (added) await deleteWishlistItem(request, added.id);
    }
  });

  test('Load More reveals additional trending games without re-fetching', async ({ page, request }) => {
    // Real BGG network call — same skip convention as the other trending test, and
    // genuinely slow the first time for the same reason (cold-cache rate limiting).
    test.setTimeout(150_000);

    const probe = await request.get('/api/bgg/search?q=catan');
    const hits = await probe.json();
    test.skip(hits.length === 0, 'No BGG_API_TOKEN configured in this environment — see backend/.env.');

    await page.goto('/wishlist');
    await page.getByRole('button', { name: 'Browse Trending', exact: true }).click();

    const tiles = page.locator('.wishlist-tile');
    await expect(tiles.first()).toBeVisible({ timeout: 90_000 });
    const initialCount = await tiles.count();
    // BGG's hot list is a fixed ~50-item snapshot — only meaningful to assert
    // "Load More" appears/works when there's more than one page's worth already
    // fetched. With fewer, there's nothing left to reveal, so skip rather than fail.
    const loadMore = page.getByRole('button', { name: /^Load More/ });
    test.skip(!(await loadMore.isVisible()), 'Trending list is small enough that everything already fits on one page.');

    await loadMore.click();
    // Reveals up to 20 more of the already-fetched list — exactly 20 more unless
    // fewer than that remained, in which case everything left is now shown.
    await expect(async () => {
      expect(await tiles.count()).toBeGreaterThan(initialCount);
    }).toPass({ timeout: 5_000 });
  });
});
