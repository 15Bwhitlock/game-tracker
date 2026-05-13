package com.braydenwhitlock.gametracker.game;

/**
 * Thrown by GameService when a game ID doesn't exist in the database.
 *
 * GlobalExceptionHandler catches this specific type and returns a 404
 * response with a JSON body like {"message": "Game not found: 42"}.
 * Using a typed exception (instead of returning null or Optional) means
 * the 404 handling is guaranteed to fire — callers can't accidentally
 * ignore a missing game.
 */
public class GameNotFoundException extends RuntimeException {

    public GameNotFoundException(Long id) {
        super("Game not found: " + id);
    }
}
