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

  test('BGG search and lookup degrade gracefully without a configured token', async ({ request }) => {
    // This dev environment has no BGG_API_TOKEN set — see BggClient's javadoc. Both endpoints
    // should degrade to "no data" rather than surface BGG's underlying 401 as a 500.
    const search = await request.get('/api/bgg/search', { params: { q: 'catan' } });
    expect(search.status()).toBe(200);
    expect(await search.json()).toEqual([]);

    const details = await request.get('/api/bgg/13');
    expect(details.status()).toBe(404);
  });
});
