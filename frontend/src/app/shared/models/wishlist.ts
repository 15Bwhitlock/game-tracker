/** Mirrors the backend {@code Wishlist} entity — a game not yet owned, kept for reference. */
export interface Wishlist {
  id?: number;
  bggId?: number | null;
  title: string;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  yearPublished?: number | null;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  minPlayTimeMinutes?: number | null;
  maxPlayTimeMinutes?: number | null;
  complexityWeight?: number | null;
  categories: string[];
  mechanics: string[];
  notes?: string | null;
  addedAt?: string | null;
}

export function emptyWishlistItem(): Wishlist {
  return {
    title: '',
    categories: [],
    mechanics: []
  };
}
