import { test, expect } from '@playwright/test';
import { seedGame, deleteGame, e2eTitle, waitForTagDescription, deleteTagDescription } from './support/api';

test.describe('Dictionary page', () => {
  test('lists reference sections by default', async ({ page }) => {
    await page.goto('/dictionary');
    await expect(page.getByRole('heading', { name: 'Dictionary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Complexity Scale' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mechanics' })).toBeVisible();
  });

  test('search filters categories and mechanics by name', async ({ page }) => {
    await page.goto('/dictionary');
    const search = page.getByPlaceholder('Search categories, mechanics, glossary…');

    // A known preset mechanic (see game-mechanics.ts) — filtering to it should
    // hide unrelated entries and the reference sections that only show when unfiltered.
    await search.fill('Cooperative Game');
    await expect(page.getByRole('heading', { name: 'Complexity Scale' })).not.toBeVisible();
    await expect(page.locator('.entry__name', { hasText: 'Cooperative Game' }).first()).toBeVisible();

    await search.fill('__no_such_term_should_exist__');
    await expect(page.getByText(/No categories match/)).toBeVisible();
    await expect(page.getByText(/No mechanics match/)).toBeVisible();
  });

  test('search also matches definition/description text, not just names', async ({ page }) => {
    await page.goto('/dictionary');
    const search = page.getByPlaceholder('Search categories, mechanics, glossary…');

    // "perfect information" appears only in the Abstract category's description
    // (game-categories.ts), never in a name — this only passes if description
    // text is actually searched, not just the term/category/mechanic name.
    await search.fill('perfect information');
    await expect(page.locator('.entry__name', { hasText: 'Abstract' })).toBeVisible();
  });

  test('clicking a category name jumps to the Collection page filtered to it', async ({ page, request }) => {
    const title = e2eTitle('dictionary link category');
    const id = await seedGame(request, { title, minPlayers: 2, maxPlayers: 2, categories: ['Strategy'] });

    try {
      await page.goto('/dictionary');
      await page.locator('.entry__name--link', { hasText: 'Strategy' }).first().click();

      await expect(page).toHaveURL(/\/collection\?search=Strategy/);
      await expect(page.getByRole('button', { name: title })).toBeVisible();
    } finally {
      await deleteGame(request, id);
    }
  });

  test('clicking a mechanic name jumps to the Collection page filtered to it', async ({ page, request }) => {
    const title = e2eTitle('dictionary link mechanic');
    const id = await seedGame(request, { title, minPlayers: 2, maxPlayers: 2, mechanics: ['Hand Management'] });

    try {
      await page.goto('/dictionary');
      await page.locator('.entry__name--link', { hasText: 'Hand Management' }).first().click();

      await expect(page).toHaveURL(/\/collection\?search=Hand(%20|\+)Management/);
      await expect(page.getByRole('button', { name: title })).toBeVisible();
    } finally {
      await deleteGame(request, id);
    }
  });

  test('shows an AI-written description for a genuinely new category, and lets you edit or delete it', async ({ page, request }) => {
    // Only meaningful with a real ANTHROPIC_API_KEY configured (see backend/.env) —
    // without one, TagDescriptionService.ensureDescribed silently no-ops and no
    // row ever appears for this brand-new category name.
    const categoryName = e2eTitle('novel category');
    const gameTitle = e2eTitle('dictionary ai tag');
    const gameId = await seedGame(request, { title: gameTitle, categories: [categoryName] });
    let tag = await waitForTagDescription(request, categoryName, 'CATEGORY');
    test.skip(!tag, 'No ANTHROPIC_API_KEY configured in this environment — see backend/.env.');

    try {
      await page.goto('/dictionary');
      const row = page.locator('.entry', { has: page.locator('.entry__name', { hasText: categoryName }) });

      await expect(page.getByRole('heading', { name: 'From Your Collection' })).toBeVisible();
      await expect(row.locator('.entry__desc')).toContainText(tag!.description);

      // Edit — the user correcting a bad or imprecise AI guess.
      await row.getByTitle('Edit description').click();
      await row.locator('textarea').fill('A corrected, user-written description.');
      await row.getByRole('button', { name: 'Save' }).click();
      await expect(row.locator('.entry__desc')).toContainText('A corrected, user-written description.');

      // Delete — removing the entry entirely.
      await row.getByTitle('Remove this entry').click();
      await expect(page.locator('.entry__name', { hasText: categoryName })).not.toBeVisible();
      tag = null;
    } finally {
      await deleteGame(request, gameId);
      if (tag) await deleteTagDescription(request, tag.id);
    }
  });
});
