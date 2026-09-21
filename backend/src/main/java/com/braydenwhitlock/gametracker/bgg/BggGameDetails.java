package com.braydenwhitlock.gametracker.bgg;

import java.util.List;

/**
 * Cleaned-up BGG game details — flat shape ready to populate a {@code Game} entity.
 *
 * @param bggId               BGG identifier; matches {@code Game.bggId}
 * @param title               primary BGG name
 * @param yearPublished       year the game was first published, if BGG knows it
 * @param description         long-form description from BGG (HTML-decoded text)
 * @param thumbnailUrl        small thumbnail URL, suitable for list views
 * @param imageUrl            full-size image URL, suitable for detail views
 * @param minPlayers          minimum supported player count
 * @param maxPlayers          maximum supported player count
 * @param minPlayTimeMinutes  shortest typical session length
 * @param maxPlayTimeMinutes  longest typical session length
 * @param complexityWeight    BGG's "weight" rating (1.0–5.0); null if unrated
 * @param categories          BGG board game category names (e.g. "Strategy")
 * @param mechanics           BGG mechanic names (e.g. "Deck Building")
 * @param bestPlayerCounts    player counts the BGG community's poll marks as "Best"
 *                            (e.g. [4] or [3, 4]); empty if BGG has no such poll data yet
 * @param basedOnBggId        BGG id of the base game this is an expansion for, from the
 *                            inbound {@code boardgameexpansion} link; null if this isn't
 *                            an expansion (or BGG has no such link for it)
 * @param basedOnGameName     the base game's name, alongside {@code basedOnBggId}
 */
public record BggGameDetails(
        int bggId,
        String title,
        Integer yearPublished,
        String description,
        String thumbnailUrl,
        String imageUrl,
        Integer minPlayers,
        Integer maxPlayers,
        Integer minPlayTimeMinutes,
        Integer maxPlayTimeMinutes,
        Double complexityWeight,
        List<String> categories,
        List<String> mechanics,
        List<Integer> bestPlayerCounts,
        Integer basedOnBggId,
        String basedOnGameName) {}
