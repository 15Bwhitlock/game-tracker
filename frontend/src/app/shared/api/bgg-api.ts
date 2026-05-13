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
}
