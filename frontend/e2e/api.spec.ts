import { test, expect } from '@playwright/test';
import { seedGame, deleteGame, e2eTitle } from './support/api';

/**
 * Direct backend checks for endpoints/edge cases that have no UI path to reach
 * them at all (favorite/series PATCH, error responses that never reach the
 * screen because a hard filter or client-side guard prevents triggering them
 * through the app itself, and the BGG proxy endpoints).
 */
test.describe('Backend API', () => {
  test('PATCH /favorite toggles the flag and PATCH /series sets it', async ({ request }) => {
    const title = e2eTitle('api favorite and series');
    const id = await seedGame(request, { title });

    const toggled = await (await request.patch(`/api/games/${id}/favorite`)).json();
    expect(toggled.favorite).toBe(true);
    const toggledBack = await (await request.patch(`/api/games/${id}/favorite`)).json();
    expect(toggledBack.favorite).toBe(false);

    const seriesName = e2eTitle('api series');
    const withSeries = await (await request.patch(`/api/games/${id}/series`, { data: { seriesName } })).json();
    expect(withSeries.seriesName).toBe(seriesName);

    // Clearing it back to null should also work (used when a series suggestion is undone).
    const cleared = await (await request.patch(`/api/games/${id}/series`, { data: { seriesName: null } })).json();
    expect(cleared.seriesName).toBeNull();

    await deleteGame(request, id);
  });

  test('GET /plays for a nonexistent game returns 404', async ({ request }) => {
    const response = await request.get('/api/games/999999999/plays');
    expect(response.status()).toBe(404);
  });

  test('DELETE a play with a mismatched game id returns 404 and does not delete it', async ({ request }) => {
    const titleA = e2eTitle('play owner a');
    const titleB = e2eTitle('play owner b');
    const idA = await seedGame(request, { title: titleA });
    const idB = await seedGame(request, { title: titleB });

    const logged = await (await request.post(`/api/games/${idA}/plays`, { data: {} })).json();
    const playId = logged.playId;

    // Attempting to delete game A's play through game B's URL should 404, not succeed.
    const mismatched = await request.delete(`/api/games/${idB}/plays/${playId}`);
    expect(mismatched.status()).toBe(404);

    // The play should still exist under its real owner.
    const plays = await (await request.get(`/api/games/${idA}/plays`)).json();
    expect(plays.some((p: { id: number }) => p.id === playId)).toBe(true);

    await deleteGame(request, idA);
    await deleteGame(request, idB);
  });

  test('POST /api/suggestions with an out-of-bounds complexity returns 400', async ({ request }) => {
    const response = await request.post('/api/suggestions', {
      data: { minPlayers: 2, minComplexity: 0.5, maxComplexity: 3 }
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/suggestions with no player count returns 400', async ({ request }) => {
    const response = await request.post('/api/suggestions', { data: {} });
    expect(response.status()).toBe(400);
  });

  test('BGG search always returns 200 with an array, even for a query nothing matches', async ({ request }) => {
    // True regardless of whether BGG_API_TOKEN is configured — a nonsense query returns
    // no results either way, so this doesn't need to branch on this environment's setup.
    const gibberish = `zzznomatch${Math.random().toString(36).slice(2, 10)}`;
    const search = await request.get('/api/bgg/search', { params: { q: gibberish } });
    expect(search.status()).toBe(200);
    expect(await search.json()).toEqual([]);
  });

  test('BGG lookup for a real id reflects whether a token is configured', async ({ request }) => {
    // Detect this environment's token status from a real search rather than hard-coding
    // an assumption either way — see backend/.env for how BGG_API_TOKEN is set locally.
    const probe = await request.get('/api/bgg/search', { params: { q: 'catan' } });
    const hits = await probe.json();
    const details = await request.get('/api/bgg/13'); // 13 is BGG's real id for Catan.

    if (hits.length === 0) {
      // No token — BggClient catches BGG's 401 and degrades to "not found" rather than 500.
      expect(details.status()).toBe(404);
    } else {
      // A real token is configured — this should be real BGG data for the actual game.
      expect(details.status()).toBe(200);
      const body = await details.json();
      expect(body.title).toBe('Catan');
      expect(body.categories.length).toBeGreaterThan(0);
    }
  });
});
