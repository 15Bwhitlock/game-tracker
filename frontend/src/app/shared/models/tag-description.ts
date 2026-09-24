/** Mirrors the backend {@code TagDescription} entity. */
export interface TagDescription {
  id: number;
  name: string;
  type: 'CATEGORY' | 'MECHANIC' | 'GLOSSARY';
  // Null when source is PENDING — AI was unavailable when this name was first saved,
  // and no one has written a description yet.
  description: string | null;
  source: 'AI' | 'USER' | 'PENDING';
  createdAt: string;
}
