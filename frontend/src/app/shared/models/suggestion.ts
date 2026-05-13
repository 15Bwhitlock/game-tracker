import { Game } from './game';

/**
 * Mirrors the backend `SuggestionCriteria` record.
 * Only `players` is required; everything else narrows the result set.
 */
export interface SuggestionCriteria {
  minPlayers: number | null;
  maxPlayers?: number | null;
  minMinutes?: number | null;
  maxMinutes?: number | null;
  minComplexity?: number | null;
  maxComplexity?: number | null;
  categories?: string[] | null;
  mechanics?: string[] | null;
  series?: string[] | null;
  favoritesOnly?: boolean | null;
  unplayedOnly?: boolean | null;
  maxPlayCount?: number | null;
  minRating?: number | null;
  page?: number | null;
}

export interface ScoredGame {
  game: Game;
  score: number;
  reasons: string[];
}

export interface SuggestionPage {
  items: ScoredGame[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

