import { APIRequestContext, expect } from '@playwright/test';

/**
 * Helpers for seeding/cleaning up games through the real backend API.
 *
 * These tests run against the actual dev backend + Postgres database (there's
 * no separate test profile for a personal project this size — see
 * PLAN.md's testing strategy). To avoid polluting the real collection, every
 * game created here gets a title prefixed with E2E_TITLE_PREFIX and is
 * deleted in an afterEach/afterAll hook. Never assert against the full
 * collection list — always scope assertions to games this run created.
 */
export const E2E_TITLE_PREFIX = 'E2e';

/**
 * GameForm title-cases the title on save (see toTitleCase in game-form.ts:
 * capitalize each word's first letter, leave the rest as-is). Games created
 * directly via the API skip that transform. To make titles compare equal
 * either way, generate them already in that same shape.
 */
function titleCase(s: string): string {
  return s
    .trim()
    .split(' ')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function e2eTitle(name: string): string {
  // A random suffix keeps titles unique across parallel test workers/runs.
  const suffix = Math.random().toString(36).slice(2, 8);
  return titleCase(`${E2E_TITLE_PREFIX} ${name} ${suffix}`);
}

export interface SeedGameOptions {
  title: string;
  bggId?: number | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  yearPublished?: number | null;
  minPlayers?: number;
  maxPlayers?: number;
  minPlayTimeMinutes?: number;
  maxPlayTimeMinutes?: number;
  complexityWeight?: number | null;
  categories?: string[];
  mechanics?: string[];
  bestPlayerCounts?: number[];
  personalRating?: number | null;
  notes?: string | null;
  favorite?: boolean;
  seriesName?: string | null;
  basedOnBggId?: number | null;
  basedOnGameName?: string | null;
}

/** Creates a game via POST /api/games and returns its id. */
export async function seedGame(request: APIRequestContext, options: SeedGameOptions): Promise<number> {
  const response = await request.post('/api/games', {
    data: {
      title: options.title,
      bggId: options.bggId ?? null,
      thumbnailUrl: options.thumbnailUrl ?? null,
      imageUrl: options.imageUrl ?? null,
      yearPublished: options.yearPublished ?? null,
      minPlayers: options.minPlayers ?? 2,
      maxPlayers: options.maxPlayers ?? 4,
      minPlayTimeMinutes: options.minPlayTimeMinutes ?? 30,
      maxPlayTimeMinutes: options.maxPlayTimeMinutes ?? 60,
      complexityWeight: options.complexityWeight ?? null,
      categories: options.categories ?? [],
      mechanics: options.mechanics ?? [],
      bestPlayerCounts: options.bestPlayerCounts ?? [],
      personalRating: options.personalRating ?? null,
      notes: options.notes ?? null,
      favorite: options.favorite ?? false,
      seriesName: options.seriesName ?? null,
      basedOnBggId: options.basedOnBggId ?? null,
      basedOnGameName: options.basedOnGameName ?? null
    }
  });
  expect(response.ok(), `seedGame failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const body = await response.json();
  return body.id as number;
}

/** Deletes a game by id; tolerates it already being gone. */
export async function deleteGame(request: APIRequestContext, id: number): Promise<void> {
  const response = await request.delete(`/api/games/${id}`);
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`deleteGame(${id}) failed: ${response.status()} ${await response.text()}`);
  }
}

/** Deletes every game whose title starts with the e2e prefix. Use as a safety-net afterAll. */
export async function deleteAllE2eGames(request: APIRequestContext): Promise<void> {
  const response = await request.get('/api/games');
  expect(response.ok()).toBeTruthy();
  const games = (await response.json()) as Array<{ id: number; title: string }>;
  const stray = games.filter((g) => g.title.startsWith(E2E_TITLE_PREFIX));
  await Promise.all(stray.map((g) => deleteGame(request, g.id)));
}

export interface SeedWishlistOptions {
  title: string;
  bggId?: number | null;
  categories?: string[];
  mechanics?: string[];
  notes?: string | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  minPlayTimeMinutes?: number | null;
  maxPlayTimeMinutes?: number | null;
  complexityWeight?: number | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  basedOnBggId?: number | null;
  basedOnGameName?: string | null;
}

/** Creates a wishlist item via POST /api/wishlist and returns its id. */
export async function seedWishlistItem(request: APIRequestContext, options: SeedWishlistOptions): Promise<number> {
  const response = await request.post('/api/wishlist', {
    data: {
      title: options.title,
      bggId: options.bggId ?? null,
      categories: options.categories ?? [],
      mechanics: options.mechanics ?? [],
      notes: options.notes ?? null,
      minPlayers: options.minPlayers ?? null,
      maxPlayers: options.maxPlayers ?? null,
      minPlayTimeMinutes: options.minPlayTimeMinutes ?? null,
      maxPlayTimeMinutes: options.maxPlayTimeMinutes ?? null,
      complexityWeight: options.complexityWeight ?? null,
      thumbnailUrl: options.thumbnailUrl ?? null,
      imageUrl: options.imageUrl ?? null,
      basedOnBggId: options.basedOnBggId ?? null,
      basedOnGameName: options.basedOnGameName ?? null
    }
  });
  expect(response.ok(), `seedWishlistItem failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const body = await response.json();
  return body.id as number;
}

/** Deletes a wishlist item by id; tolerates it already being gone. */
export async function deleteWishlistItem(request: APIRequestContext, id: number): Promise<void> {
  const response = await request.delete(`/api/wishlist/${id}`);
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`deleteWishlistItem(${id}) failed: ${response.status()} ${await response.text()}`);
  }
}

/** Deletes every wishlist item whose title starts with the e2e prefix. Safety-net afterAll. */
export async function deleteAllE2eWishlistItems(request: APIRequestContext): Promise<void> {
  const response = await request.get('/api/wishlist');
  expect(response.ok()).toBeTruthy();
  const items = (await response.json()) as Array<{ id: number; title: string }>;
  const stray = items.filter((i) => i.title.startsWith(E2E_TITLE_PREFIX));
  await Promise.all(stray.map((i) => deleteWishlistItem(request, i.id)));
}

export interface TagDescriptionRow {
  id: number;
  name: string;
  type: 'CATEGORY' | 'MECHANIC';
  description: string;
  source: 'AI' | 'USER';
}

/**
 * Polls GET /api/tag-descriptions for a row matching (name, type), written
 * asynchronously by TagDescriptionService after a game/wishlist save. Only ever
 * appears when a real ANTHROPIC_API_KEY is configured (see backend/.env) — returns
 * null on timeout so callers can test.skip rather than fail in an unconfigured env.
 */
export async function waitForTagDescription(
  request: APIRequestContext,
  name: string,
  type: 'CATEGORY' | 'MECHANIC',
  timeoutMs = 20000
): Promise<TagDescriptionRow | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await request.get('/api/tag-descriptions');
    expect(response.ok()).toBeTruthy();
    const rows = (await response.json()) as TagDescriptionRow[];
    const match = rows.find((r) => r.type === type && r.name.toLowerCase() === name.toLowerCase());
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

/** Deletes a tag description by id; tolerates it already being gone. */
export async function deleteTagDescription(request: APIRequestContext, id: number): Promise<void> {
  const response = await request.delete(`/api/tag-descriptions/${id}`);
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`deleteTagDescription(${id}) failed: ${response.status()} ${await response.text()}`);
  }
}

/** Reads the current value of the app-wide "AI enabled" setting. */
export async function getAiEnabled(request: APIRequestContext): Promise<boolean> {
  const response = await request.get('/api/settings');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body.aiEnabled as boolean;
}

/** Flips the app-wide "AI enabled" setting and returns the new value. */
export async function setAiEnabled(request: APIRequestContext, aiEnabled: boolean): Promise<void> {
  const response = await request.patch('/api/settings', { data: { aiEnabled } });
  expect(response.ok(), `setAiEnabled failed: ${response.status()} ${await response.text()}`).toBeTruthy();
}
