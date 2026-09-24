import { Injectable, signal } from '@angular/core';

export type SortKey = 'title-asc' | 'title-desc' | 'favorites' | 'plays-desc' | 'plays-asc' | 'last-played' | 'rating-desc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'title-asc',   label: 'Title (A–Z)' },
  { key: 'title-desc',  label: 'Title (Z–A)' },
  { key: 'favorites',   label: 'Favorites first' },
  { key: 'plays-desc',  label: 'Most played' },
  { key: 'plays-asc',   label: 'Least played' },
  { key: 'last-played', label: 'Recently played' },
  { key: 'rating-desc', label: 'Highest rated' },
];

export interface Preferences {
  collectionSort: SortKey;
  suggestPlayers: number | null;
  suggestMaxMinutes: number | null;
  suggestMaxComplexity: number | null;
  showNewBadges: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  collectionSort: 'title-asc',
  suggestPlayers: null,
  suggestMaxMinutes: null,
  suggestMaxComplexity: null,
  showNewBadges: true,
};

/**
 * Per-browser display preferences edited on the Settings page. Like ThemeService and the
 * Collection's view mode these are viewing habits, not data, so they live in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private static readonly KEY = 'preferences';

  readonly prefs = signal<Preferences>(this.load());

  update(patch: Partial<Preferences>): void {
    this.set({ ...this.prefs(), ...patch });
  }

  reset(): void {
    this.set({ ...DEFAULT_PREFERENCES });
  }

  private set(next: Preferences): void {
    this.prefs.set(next);
    try {
      localStorage.setItem(PreferencesService.KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode) — the choice just won't outlive this tab.
    }
  }

  private load(): Preferences {
    try {
      const raw = localStorage.getItem(PreferencesService.KEY);
      return { ...DEFAULT_PREFERENCES, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }
}
