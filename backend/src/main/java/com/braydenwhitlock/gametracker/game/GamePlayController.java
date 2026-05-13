package com.braydenwhitlock.gametracker.game;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * Endpoints for logging, undoing, and listing play sessions.
 *
 * All routes are nested under /api/games/{gameId}/plays, which makes the
 * relationship explicit: plays belong to a game.
 */
@RestController
@RequestMapping("/api/games/{gameId}/plays")
public class GamePlayController {

    private final GameService gameService;
    private final GamePlayRepository playRepository;

    public GamePlayController(GameService gameService, GamePlayRepository playRepository) {
        this.gameService = gameService;
        this.playRepository = playRepository;
    }

    // POST /api/games/{gameId}/plays — records a new play session.
    // The body is optional: if you send { "playedAt": "2025-05-01" } the play
    // is recorded on that date; if the body is absent or playedAt is null,
    // today's date is used (the common case — you just finished playing).
    // Returns the updated Game (with new playCount) plus the new play's ID
    // (so the UI can undo it if needed).
    @PostMapping
    public LogPlayResponse logPlay(@PathVariable Long gameId,
                                   @RequestBody(required = false) LogPlayRequest body) {
        LocalDate date = (body != null && body.playedAt() != null) ? body.playedAt() : LocalDate.now();
        return gameService.logPlay(gameId, date);
    }

    // DELETE /api/games/{gameId}/plays/{playId} — removes a specific play.
    // Used for the "Undo" action in the UI, shown briefly after logging a play.
    // Returns the updated Game so the UI can refresh the play count and lastPlayedAt.
    @DeleteMapping("/{playId}")
    public Game undoPlay(@PathVariable Long gameId, @PathVariable Long playId) {
        return gameService.undoPlay(gameId, playId);
    }

    // GET /api/games/{gameId}/plays — returns the full play history for a game,
    // sorted newest first. Used in the detail modal and the edit form.
    @GetMapping
    public List<GamePlay> getPlays(@PathVariable Long gameId) {
        // Validate the gameId so we return 404 for unknown games rather than
        // an empty list that looks like "no plays" for a non-existent game.
        gameService.findById(gameId);
        return playRepository.findByGameIdOrderByPlayedAtDesc(gameId);
    }

    // The request body for logging a play. A Java record is concise for a
    // small DTO like this — Jackson deserializes it automatically.
    record LogPlayRequest(LocalDate playedAt) {}
}
