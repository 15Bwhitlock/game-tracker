export interface Game {
  id?: number;
  bggId?: number | null;
  title: string;
  minPlayers: number | null;
  maxPlayers: number | null;
  minPlayTimeMinutes: number | null;
  maxPlayTimeMinutes: number | null;
  complexityWeight?: number | null;
  categories: string[];
  mechanics: string[];
  thumbnailUrl?: string | null;
  ownedSince?: string | null;
  personalRating?: number | null;
  notes?: string | null;
  lastPlayedAt?: string | null;
  favorite?: boolean;
  playCount?: number;
  seriesName?: string | null;
}

export function emptyGame(): Game {
  return {
    title: '',
    minPlayers: null,
    maxPlayers: null,
    minPlayTimeMinutes: null,
    maxPlayTimeMinutes: null,
    categories: [],
    mechanics: []
  };
}
