/** Mirrors the backend {@code TagDescription} entity. */
export interface TagDescription {
  id: number;
  name: string;
  type: 'CATEGORY' | 'MECHANIC';
  description: string;
  source: 'AI' | 'USER';
}
