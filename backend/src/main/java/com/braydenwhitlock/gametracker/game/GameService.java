package com.braydenwhitlock.gametracker.game;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * All business logic for the game collection.
 *
 * @Transactional at the class level means every public method runs inside a
 * database transaction by default — if anything throws an exception, all
 * DB changes in that method are automatically rolled back.
 *
 * Individual methods can override this with @Transactional(readOnly = true),
 * which tells the DB driver it won't need to track changes, giving a small
 * performance boost for pure reads.
 */
@Service
@Transactional
public class GameService {

    private final GameRepository gameRepository;
    private final GamePlayRepository playRepository;

    // EntityManager gives us low-level JPA control. We use it in logPlay and
    // undoPlay to force a flush + refresh so the returned Game has an accurate
    // playCount (which is a SQL @Formula, not a normal column).
    private final EntityManager entityManager;

    public GameService(GameRepository gameRepository,
                       GamePlayRepository playRepository,
                       EntityManager entityManager) {
        this.gameRepository = gameRepository;
        this.playRepository = playRepository;
        this.entityManager = entityManager;
    }

    // readOnly = true tells the DB this query won't modify anything — small
    // efficiency gain, and it prevents accidental writes inside read methods.
    @Transactional(readOnly = true)
    public List<Game> findAll() {
        return gameRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Game findById(Long id) {
        // orElseThrow converts an Optional into a typed exception that
        // GlobalExceptionHandler catches and turns into a 404 response.
        return gameRepository.findById(id).orElseThrow(() -> new GameNotFoundException(id));
    }

    public Game create(Game game) {
        // Clear the ID so the DB generates a fresh one — prevents a client
        // from forcing a specific ID or accidentally updating an existing game.
        game.setId(null);
        return gameRepository.save(game);
    }

    /**
     * Replaces all updatable fields on an existing game. The ID in the URL
     * is authoritative — the body's ID (if any) is ignored.
     */
    public Game update(Long id, Game updates) {
        // Load the existing row first so JPA knows what's already in the DB,
        // then overwrite only the fields the client is allowed to change.
        // We never let the client update playCount or lastPlayedAt here —
        // those are managed through the play-logging endpoints.
        Game existing = findById(id);
        existing.setBggId(updates.getBggId());
        existing.setTitle(updates.getTitle());
        existing.setMinPlayers(updates.getMinPlayers());
        existing.setMaxPlayers(updates.getMaxPlayers());
        existing.setMinPlayTimeMinutes(updates.getMinPlayTimeMinutes());
        existing.setMaxPlayTimeMinutes(updates.getMaxPlayTimeMinutes());
        existing.setComplexityWeight(updates.getComplexityWeight());
        existing.setCategories(updates.getCategories());
        existing.setMechanics(updates.getMechanics());
        existing.setThumbnailUrl(updates.getThumbnailUrl());
        existing.setOwnedSince(updates.getOwnedSince());
        existing.setPersonalRating(updates.getPersonalRating());
        existing.setNotes(updates.getNotes());
        existing.setLastPlayedAt(updates.getLastPlayedAt());
        existing.setSeriesName(updates.getSeriesName());
        // JPA dirty-checking detects the changed fields and issues an UPDATE
        // automatically when the transaction commits — no explicit save() needed here.
        return existing;
    }

    public Game updateSeriesName(Long id, String seriesName) {
        Game game = findById(id);
        game.setSeriesName(seriesName);
        return gameRepository.save(game);
    }

    public void delete(Long id) {
        // Check first so we can throw a 404 if the game doesn't exist,
        // rather than silently doing nothing (deleteById ignores missing IDs).
        if (!gameRepository.existsById(id)) {
            throw new GameNotFoundException(id);
        }
        // Cascade delete in the DB removes associated game_categories,
        // game_mechanics, and game_plays rows automatically.
        gameRepository.deleteById(id);
    }

    public Game toggleFavorite(Long gameId) {
        Game game = findById(gameId);
        game.setFavorite(!game.isFavorite());
        // findById is @Transactional(readOnly=true); calling save() explicitly ensures
        // the change is written regardless of whether dirty-checking flushes it.
        return gameRepository.save(game);
    }

    public LogPlayResponse logPlay(Long gameId, LocalDate playedAt) {
        Game game = findById(gameId);
        // Insert a new row in game_plays to record this session.
        GamePlay play = playRepository.save(new GamePlay(gameId, playedAt));
        // Keep lastPlayedAt as the most recent date across all plays, so the
        // variety-scoring logic in SuggestionService always has a fresh value.
        if (game.getLastPlayedAt() == null || playedAt.isAfter(game.getLastPlayedAt())) {
            game.setLastPlayedAt(playedAt);
        }
        // flush() forces the INSERT for the new play so the @Formula playCount is
        // up-to-date, then refresh() reloads the entity so the returned Game reflects it.
        entityManager.flush();
        entityManager.refresh(game);
        return new LogPlayResponse(game, play.getId());
    }

    public Game undoPlay(Long gameId, Long playId) {
        // Verify the play belongs to this game before deleting — prevents one
        // game's playId from accidentally deleting a play on a different game.
        GamePlay play = playRepository.findById(playId)
                .filter(p -> p.getGameId().equals(gameId))
                .orElseThrow(() -> new GameNotFoundException(gameId));
        playRepository.delete(play);
        Game game = findById(gameId);
        // Recalculate lastPlayedAt from remaining plays rather than decrementing,
        // since the deleted play may not have been the most recent one.
        LocalDate newLastPlayed = playRepository.findByGameIdOrderByPlayedAtDesc(gameId)
                .stream().findFirst().map(GamePlay::getPlayedAt).orElse(null);
        game.setLastPlayedAt(newLastPlayed);
        // Same flush+refresh pattern as logPlay — needed to reflect the updated @Formula playCount.
        entityManager.flush();
        entityManager.refresh(game);
        return game;
    }
}
