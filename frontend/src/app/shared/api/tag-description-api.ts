import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { TagDescription } from '@shared/models';

/**
 * Thin HTTP wrapper around the /api/tag-descriptions endpoints. Mirrors WishlistApi's style.
 */
@Injectable({ providedIn: 'root' })
export class TagDescriptionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/tag-descriptions';

  list(): Observable<TagDescription[]> {
    return this.http.get<TagDescription[]>(this.baseUrl);
  }

  updateDescription(id: number, description: string): Observable<TagDescription> {
    return this.http.patch<TagDescription>(`${this.baseUrl}/${id}`, { description });
  }

  /** Creates or updates the user's override of a curated (preset/glossary) entry. */
  override(name: string, type: TagDescription['type'], description: string): Observable<TagDescription> {
    return this.http.put<TagDescription>(`${this.baseUrl}/override`, { name, type, description });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
