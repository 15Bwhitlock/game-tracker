import { BggGameDetails, Game, PLAYERS_UNLIMITED, TIME_OPTIONS, TIME_UNLIMITED } from '@shared/models';
import { decodeBggDescription } from './format-utils';

// BGG's player/time/complexity fields are free-form numbers; ours are limited to the
// discrete button-group options (see game-constants.ts). Snap an imported value onto
// the nearest one so the form's buttons actually light up instead of silently holding
// an unrepresentable value.
function snapPlayerCount(n: number | null): number | null {
  if (n == null) return null;
  if (n > 10) return PLAYERS_UNLIMITED;
  return Math.max(1, Math.round(n));
}

function snapPlayTime(n: number | null): number | null {
  if (n == null) return null;
  if (n > 240) return TIME_UNLIMITED;
  const buckets = TIME_OPTIONS.filter(t => t !== TIME_UNLIMITED);
  return buckets.reduce((closest, t) => (Math.abs(t - n) < Math.abs(closest - n) ? t : closest), buckets[0]);
}

function snapComplexity(n: number | null): number | null {
  if (n == null) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * Merges freshly-fetched BGG data onto a game: BGG values win where BGG has one, the
 * game's own value is kept otherwise. Notes are always replaced with BGG's description
 * (per explicit request: a lookup should always overwrite Notes). Shared by the add/edit
 * form's import + refresh and Settings' "refresh all".
 */
export function mergeBggDetails(d: Game, details: BggGameDetails): Game {
  return {
    ...d,
    bggId: details.bggId,
    title: details.title || d.title,
    minPlayers: snapPlayerCount(details.minPlayers) ?? d.minPlayers,
    maxPlayers: snapPlayerCount(details.maxPlayers) ?? d.maxPlayers,
    minPlayTimeMinutes: snapPlayTime(details.minPlayTimeMinutes) ?? d.minPlayTimeMinutes,
    maxPlayTimeMinutes: snapPlayTime(details.maxPlayTimeMinutes) ?? d.maxPlayTimeMinutes,
    complexityWeight: snapComplexity(details.complexityWeight) ?? d.complexityWeight,
    categories: details.categories.length > 0 ? details.categories : d.categories,
    mechanics: details.mechanics.length > 0 ? details.mechanics : d.mechanics,
    thumbnailUrl: details.thumbnailUrl ?? d.thumbnailUrl,
    imageUrl: details.imageUrl ?? d.imageUrl,
    yearPublished: details.yearPublished ?? d.yearPublished,
    bestPlayerCounts: details.bestPlayerCounts.length > 0 ? details.bestPlayerCounts : d.bestPlayerCounts,
    notes: details.description ? decodeBggDescription(details.description) : d.notes,
    basedOnBggId: details.basedOnBggId ?? d.basedOnBggId,
    basedOnGameName: details.basedOnGameName ?? d.basedOnGameName,
  };
}
