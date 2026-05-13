package com.braydenwhitlock.gametracker.bgg;

/**
 * One result from a BGG search. Lightweight by design — full metadata requires a separate
 * {@link BggClient#getDetails} call.
 */
public record BggSearchHit(int bggId, String name, Integer yearPublished) {}
