import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AppSettings } from '@shared/models';

/** Thin HTTP wrapper around /api/settings. Mirrors TagDescriptionApi's style. */
@Injectable({ providedIn: 'root' })
export class AppSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/settings';

  get(): Observable<AppSettings> {
    return this.http.get<AppSettings>(this.baseUrl);
  }

  markDictionaryViewed(): Observable<AppSettings> {
    return this.http.post<AppSettings>(`${this.baseUrl}/dictionary-viewed`, {});
  }
}
