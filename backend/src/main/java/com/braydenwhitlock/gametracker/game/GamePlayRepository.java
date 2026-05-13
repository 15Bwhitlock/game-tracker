package com.braydenwhitlock.gametracker.game;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Database access for the game_plays table.
 *
 * JpaRepository gives us free implementations of save(), findById(),
 * delete(), etc. The one custom method below is auto-implemented by
 * Spring Data JPA — it reads the method name and generates the right
 * SQL: "SELECT * FROM game_plays WHERE game_id = ? ORDER BY played_at DESC".
 */
public interface GamePlayRepository extends JpaRepository<GamePlay, Long> {

    // Returns all plays for a game, most recent first. Used in the play
    // history list on the edit form and the detail modal.
    List<GamePlay> findByGameIdOrderByPlayedAtDesc(Long gameId);
}
