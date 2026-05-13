import { Routes } from '@angular/router';

/**
 * Client-side routes — Angular handles navigation without full page reloads.
 *
 * loadComponent uses lazy loading: each component's JS bundle is only fetched
 * from the server when a user actually navigates to that route, keeping the
 * initial page load fast.
 *
 * WebConfig on the backend forwards all non-API requests to index.html so
 * Angular's router takes over even on a hard refresh or direct URL entry.
 */
export const routes: Routes = [
  // Redirect the bare root URL to /collection so there's always a default page.
  { path: '', pathMatch: 'full', redirectTo: 'collection' },

  // The main game library — shows the full collection in a sortable/searchable table.
  {
    path: 'collection',
    loadComponent: () => import('./games/game-list/game-list').then((m) => m.GameList)
  },

  // Add a new game — same GameForm component as the edit route below.
  // The form detects which mode it's in by checking whether the :id param is present.
  {
    path: 'games/add',
    loadComponent: () => import('./games/game-form/game-form').then((m) => m.GameForm)
  },

  // Edit an existing game — loads the game by :id and pre-fills the form.
  {
    path: 'games/:id/edit',
    loadComponent: () => import('./games/game-form/game-form').then((m) => m.GameForm)
  },

  // Suggestion engine — enter criteria (players, time, complexity, etc.) and
  // get back a ranked list of games from the collection that fit.
  {
    path: 'suggest',
    loadComponent: () =>
      import('./suggestions/suggest-page/suggest-page').then((m) => m.SuggestPage)
  },

  // Reference page — searchable list of all preset categories and mechanics
  // with descriptions, so you can look up what they mean while filling in a game.
  {
    path: 'dictionary',
    loadComponent: () =>
      import('./dictionary/dictionary-page/dictionary-page').then((m) => m.DictionaryPage)
  }
];
