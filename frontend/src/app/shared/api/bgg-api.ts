import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BggGameDetails, BggSearchHit } from '@shared/models';

@Injectable({ providedIn: 'root' })
export class BggApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/bgg';

  search(query: string): Observable<BggSearchHit[]> {
    return this.http.get<BggSearchHit[]>(`${this.baseUrl}/search`, {
      params: { q: query }
    });
  }

  details(bggId: number): Observable<BggGameDetails> {
    return this.http.get<BggGameDetails>(`${this.baseUrl}/${bggId}`);
  }

  // BGG's current "hot list" (~50 trending games), enriched server-side with full
  // details so results can be filtered by category. Empty array (not an error) when
  // no BGG_API_TOKEN is configured.
  hot(): Observable<BggGameDetails[]> {
    return this.http.get<BggGameDetails[]>(`${this.baseUrl}/hot`);
  }
}
