/** Mirrors the backend {@code AppSettings} entity — a single app-wide settings row. */
export interface AppSettings {
  // Null until the Dictionary page has ever been viewed.
  dictionaryLastViewedAt: string | null;
}
