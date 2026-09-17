import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Game, Wishlist } from '@shared/models';

/**
 * Thin HTTP wrapper around the /api/wishlist endpoints. Mirrors GameApi's style.
 */
@Injectable({ providedIn: 'root' })
export class WishlistApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/wishlist';

  list(): Observable<Wishlist[]> {
    return this.http.get<Wishlist[]>(this.baseUrl);
  }

  add(item: Wishlist): Observable<Wishlist> {
    return this.http.post<Wishlist>(this.baseUrl, item);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // Converts a wishlist entry into an owned Game and removes it from the wishlist.
  // Returns the newly-created Game.
  moveToCollection(id: number): Observable<Game> {
    return this.http.post<Game>(`${this.baseUrl}/${id}/move-to-collection`, {});
  }
}
