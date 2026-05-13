import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SuggestionCriteria, SuggestionPage } from '@shared/models';

/**
 * Sends suggestion criteria to the backend and returns ranked game suggestions.
 *
 * Uses POST (not GET) because the criteria object can be complex — it includes
 * arrays for categories/mechanics and multiple optional filters. Stuffing all
 * that into a query string would be messy and brittle.
 */
@Injectable({ providedIn: 'root' })
export class SuggestionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/suggestions';

  suggest(criteria: SuggestionCriteria): Observable<SuggestionPage> {
    // Strip null/empty fields before sending — the backend uses @Min(1) on
    // optional numeric fields, so sending null would trigger a 400 validation
    // error. Omitting the key entirely is cleaner than weakening the validation.
    return this.http.post<SuggestionPage>(this.baseUrl, this.clean(criteria));
  }

  // Builds a plain object with only the fields that have meaningful values.
  // The spread syntax `...(condition && { key: value })` is a concise way to
  // conditionally include a key — if condition is false, nothing is added.
  private clean(criteria: SuggestionCriteria): Record<string, unknown> {
    return {
      minPlayers: criteria.minPlayers,                                                             // always required
      ...(criteria.maxPlayers != null    && { maxPlayers:    criteria.maxPlayers }),
      ...(criteria.minMinutes != null    && { minMinutes:    criteria.minMinutes }),
      ...(criteria.maxMinutes != null    && { maxMinutes:    criteria.maxMinutes }),
      ...(criteria.minComplexity != null && { minComplexity: criteria.minComplexity }),
      ...(criteria.maxComplexity != null && { maxComplexity: criteria.maxComplexity }),
      ...(criteria.categories?.length    && { categories:    criteria.categories }),
      ...(criteria.mechanics?.length     && { mechanics:     criteria.mechanics }),
      ...(criteria.series?.length        && { series:        criteria.series }),
      ...(criteria.favoritesOnly         && { favoritesOnly: true }),
      ...(criteria.unplayedOnly          && { unplayedOnly:   true }),
      ...(criteria.maxPlayCount != null  && { maxPlayCount:  criteria.maxPlayCount }),
      ...(criteria.minRating != null     && { minRating:     criteria.minRating }),
      ...(criteria.page != null          && { page:          criteria.page }),
    };
  }
}
