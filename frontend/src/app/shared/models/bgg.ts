/** Mirrors the backend {@code BggSearchHit} record. */
export interface BggSearchHit {
  bggId: number;
  name: string;
  yearPublished: number | null;
}

/** Mirrors the backend {@code BggGameDetails} record. */
export interface BggGameDetails {
  bggId: number;
  title: string;
  yearPublished: number | null;
  description: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  minPlayTimeMinutes: number | null;
  maxPlayTimeMinutes: number | null;
  complexityWeight: number | null;
  categories: string[];
  mechanics: string[];
}
