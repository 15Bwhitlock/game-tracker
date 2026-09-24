import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Shape of the backup file (mirrors the backend's BackupData); contents are opaque to the UI. */
export interface BackupFile {
  version: number;
  exportedAt?: string;
  games?: { game: unknown; plays?: unknown[] }[];
  wishlist?: unknown[];
  tagDescriptions?: unknown[];
}

export type RestoreCounts = Record<'games' | 'plays' | 'wishlist' | 'tagDescriptions', number>;

@Injectable({ providedIn: 'root' })
export class BackupApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/backup';

  export(): Observable<Blob> {
    return this.http.get(this.baseUrl, { responseType: 'blob' });
  }

  restore(data: BackupFile): Observable<RestoreCounts> {
    return this.http.post<RestoreCounts>(`${this.baseUrl}/restore`, data);
  }
}
