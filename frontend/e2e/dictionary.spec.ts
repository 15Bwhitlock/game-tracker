import { test, expect } from '@playwright/test';
import {
  seedGame,
  deleteGame,
  e2eTitle,
  waitForTagDescription,
  deleteTagDescription,
  deleteTagDescriptionByName
} from './support/api';

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

  test('shows a "not yet described" placeholder for a new category and lets you fill it in', async ({ page, request }) => {
    const categoryName = e2eTitle('pending category');
    const gameTitle = e2eTitle('dictionary pending tag');
    const gameId = await seedGame(request, { title: gameTitle, categories: [categoryName] });
    const tag = await waitForTagDescription(request, categoryName, 'CATEGORY');

    try {
      expect(tag, 'expected a PENDING placeholder row to be created').not.toBeNull();
      expect(tag!.source).toBe('PENDING');
      expect(tag!.description).toBeNull();

      await page.goto('/dictionary');
      const row = page.locator('.entry', { has: page.locator('.entry__name', { hasText: categoryName }) });
      await expect(row.locator('.entry__desc--pending')).toBeVisible();

      await row.getByTitle('Add description').click();
      await row.locator('textarea').fill('A manually written description.');
      await row.getByRole('button', { name: 'Save' }).click();

      await expect(row.locator('.entry__desc--pending')).not.toBeVisible();
      await expect(row.locator('.entry__desc')).toContainText('A manually written description.');
    } finally {
      await deleteGame(request, gameId);
      if (tag) await deleteTagDescription(request, tag.id);
    }
  });

  test('marks a freshly added entry as "New" until you view the Dictionary page again', async ({ page, request }) => {
    const categoryName = e2eTitle('new badge category');
    const gameTitle = e2eTitle('new badge game');
    const gameId = await seedGame(request, { title: gameTitle, categories: [categoryName] });
    const tag = await waitForTagDescription(request, categoryName, 'CATEGORY');

    try {
      expect(tag).not.toBeNull();
      const row = page.locator('.entry', { has: page.locator('.entry__name', { hasText: categoryName }) });

      await page.goto('/dictionary');
      await expect(row.locator('.badge--new')).toBeVisible();

      // Loading the page fires a fire-and-forget "mark viewed" call — wait for it to
      // actually land (dictionaryLastViewedAt now past this tag's createdAt) before
      // reloading, rather than racing an arbitrary timeout against the network.
      await expect.poll(async () => {
        const settings = await request.get('/api/settings').then(r => r.json());
        return settings.dictionaryLastViewedAt && new Date(settings.dictionaryLastViewedAt) > new Date(tag!.createdAt);
      }).toBe(true);

      await page.reload();
      await expect(row.locator('.badge--new')).not.toBeVisible();
    } finally {
      await deleteGame(request, gameId);
      if (tag) await deleteTagDescription(request, tag.id);
    }
  });

  for (const c of [
    { label: 'category', type: 'CATEGORY' as const, name: 'Strategy', original: 'Long-term planning' },
    { label: 'glossary term', type: 'GLOSSARY' as const, name: 'Filler', original: 'short (15–30 min) game' }
  ]) {
    test(`lets you edit a curated ${c.label}, keeps it after reload, and reverts to the original`, async ({ page, request }) => {
      const edited = `My own take on ${c.name}.`;
      try {
        await page.goto('/dictionary');
        const row = page.locator('.entry', { has: page.locator('.entry__name', { hasText: new RegExp(`^${c.name}$`) }) });
        await expect(row.locator('.entry__desc')).toContainText(c.original);
        await expect(row.locator('.badge--edited')).not.toBeVisible();

        await row.getByTitle('Edit description').click();
        await row.locator('textarea').fill(edited);
        await row.getByRole('button', { name: 'Save' }).click();
        await expect(row.locator('.entry__desc')).toContainText(edited);
        await expect(row.locator('.badge--edited')).toBeVisible();

        await page.reload();
        await expect(row.locator('.entry__desc')).toContainText(edited);

        await row.getByTitle('Revert to the original description').click();
        await expect(row.locator('.entry__desc')).toContainText(c.original);
        await expect(row.locator('.badge--edited')).not.toBeVisible();
      } finally {
        await deleteTagDescriptionByName(request, c.name, c.type);
      }
    });
  }
});
