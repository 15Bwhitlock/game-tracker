import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Game } from '@shared/models';

// Shape of a single play record returned by the API.
export interface GamePlay {
  id: number;
  gameId: number;
  playedAt: string; // ISO date string, e.g. "2025-05-07"
}

// Returned by logPlay — bundles the refreshed game (with updated playCount)
// and the new play's ID (needed for the "Undo" action).
export interface LogPlayResponse {
  game: Game;
  playId: number;
}

/**
 * Thin HTTP wrapper around the /api/games endpoints.
 *
 * Every method returns an Observable — Angular's way of representing an
 * async HTTP call. The component subscribes to it and handles next/error.
 * Nothing here contains business logic; it just maps method calls to HTTP.
 *
 * providedIn: 'root' means Angular creates one shared instance for the
 * whole app — no need to add it to any module's providers array.
 */
@Injectable({ providedIn: 'root' })
export class GameApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/games';

  // Fetch the full game collection.
  list(): Observable<Game[]> {
    return this.http.get<Game[]>(this.baseUrl);
  }

  // Fetch a single game by ID (used when loading the edit form).
  get(id: number): Observable<Game> {
    return this.http.get<Game>(`${this.baseUrl}/${id}`);
  }

  // Create a new game. The server assigns the ID and returns the saved game.
  create(game: Game): Observable<Game> {
    return this.http.post<Game>(this.baseUrl, game);
  }

  // Replace all fields on an existing game. Returns the updated game.
  update(id: number, game: Game): Observable<Game> {
    return this.http.put<Game>(`${this.baseUrl}/${id}`, game);
  }

  // Delete a game and all its play history (cascade handled server-side).
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // Flip the favourite flag on a game. Returns the updated game.
  // Uses PATCH (partial update) rather than PUT (full replacement) because
  // we're only changing one field.
  toggleFavorite(id: number): Observable<Game> {
    return this.http.patch<Game>(`${this.baseUrl}/${id}/favorite`, {});
  }

  // Log a play session. playedAt is optional — omitting it defaults to today
  // on the server side, which is the most common case.
  logPlay(id: number, playedAt?: string): Observable<LogPlayResponse> {
    const body = playedAt ? { playedAt } : {};
    return this.http.post<LogPlayResponse>(`${this.baseUrl}/${id}/plays`, body);
  }

  // Undo (delete) a specific play session. Returns the refreshed game
  // so the UI can update playCount and lastPlayedAt immediately.
  undoPlay(gameId: number, playId: number): Observable<Game> {
    return this.http.delete<Game>(`${this.baseUrl}/${gameId}/plays/${playId}`);
  }

  // Fetch the full play history for a game, newest first.
  getPlays(id: number): Observable<GamePlay[]> {
    return this.http.get<GamePlay[]>(`${this.baseUrl}/${id}/plays`);
  }

  // Set (or clear) the series name on an already-saved game.
  updateSeriesName(id: number, seriesName: string | null): Observable<Game> {
    return this.http.patch<Game>(`${this.baseUrl}/${id}/series`, { seriesName });
  }
}
