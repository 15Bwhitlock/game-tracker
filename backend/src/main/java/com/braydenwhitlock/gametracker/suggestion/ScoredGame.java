package com.braydenwhitlock.gametracker.suggestion;

import com.braydenwhitlock.gametracker.game.Game;

import java.util.List;

/**
 * A {@link Game} paired with its computed suggestion score and the human-readable reasons
 * it floated to the top. {@code reasons} is what the UI renders under each suggestion.
 */
public record ScoredGame(Game game, double score, List<String> reasons) {}
