package com.braydenwhitlock.gametracker.suggestion;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * Inputs to {@link SuggestionService#suggest}. Only {@link #minPlayers} is required;
 * all other fields narrow the result set. Any list may be null or empty (treated as
 * "no constraint").
 *
 * @param minPlayers     minimum player count for the session (required)
 * @param maxPlayers     maximum player count; null defaults to minPlayers (exact match)
 * @param minMinutes     inclusive lower bound on max play time; null means no lower bound
 * @param maxMinutes     inclusive upper bound on max play time; null means no limit
 * @param minComplexity  inclusive lower bound on BGG weight (1.0–5.0); null means no lower bound
 * @param maxComplexity  inclusive upper bound on BGG weight; null means no upper bound
 * @param categories     game must match at least one (case-insensitive); null/empty disables filter
 * @param mechanics      game must match at least one (case-insensitive); null/empty disables filter
 * @param series         game's seriesName must match one of these (case-insensitive); null/empty disables filter
 * @param favoritesOnly  when true, only favorited games are returned
 * @param page           0-based page index; null defaults to 0
 */
public record SuggestionCriteria(
        @NotNull @Min(1) Integer minPlayers,
        @Min(1) Integer maxPlayers,
        @Min(1) Integer minMinutes,
        @Min(1) Integer maxMinutes,
        Double minComplexity,
        Double maxComplexity,
        List<String> categories,
        List<String> mechanics,
        List<String> series,
        Boolean favoritesOnly,
        Boolean unplayedOnly,
        @Min(0) Integer maxPlayCount,
        @Min(1) @Max(10) Integer minRating,
        @Min(0) Integer page) {}
