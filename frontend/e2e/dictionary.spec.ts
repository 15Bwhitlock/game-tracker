import { test, expect } from '@playwright/test';

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
    await search.fill('Cooperative Play');
    await expect(page.getByRole('heading', { name: 'Complexity Scale' })).not.toBeVisible();
    await expect(page.locator('.entry__name', { hasText: 'Cooperative Play' }).first()).toBeVisible();

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
});
