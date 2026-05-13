package com.braydenwhitlock.gametracker.game;

/**
 * What the API returns after logging a play.
 *
 * We return both the updated Game (so the UI can refresh playCount and
 * lastPlayedAt without a separate GET request) and the new play's ID
 * (so the UI can offer an "Undo" button that calls DELETE .../plays/{playId}).
 *
 * Java records are a compact way to define an immutable DTO — Jackson
 * serializes them to JSON automatically.
 */
public record LogPlayResponse(Game game, Long playId) {}
