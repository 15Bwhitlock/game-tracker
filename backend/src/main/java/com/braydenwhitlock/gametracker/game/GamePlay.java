package com.braydenwhitlock.gametracker.game;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * Records a single play session for a game.
 *
 * Stored in the "game_plays" table. Each row represents one time we
 * sat down and played a specific game. The game_id links back to the
 * games table, but we store it as a plain Long (not a @ManyToOne join)
 * to keep things simple — we only ever look up plays by game_id, never
 * navigate from a play back to a full Game object.
 *
 * The playCount field on Game is derived by COUNT(*) on this table, so
 * this table is the single source of truth for how many times a game
 * has been played.
 */
@Entity
@Table(name = "game_plays")
public class GamePlay {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Foreign key to the games table. Not a full @ManyToOne join — a plain
    // Long is enough since we only query plays by game_id, never the reverse.
    @Column(name = "game_id", nullable = false)
    private Long gameId;

    // The date the game was played. Time of day isn't tracked — just the date.
    @Column(name = "played_at", nullable = false)
    private LocalDate playedAt;

    // JPA requires a no-arg constructor.
    public GamePlay() {}

    public GamePlay(Long gameId, LocalDate playedAt) {
        this.gameId = gameId;
        this.playedAt = playedAt;
    }

    public Long getId() { return id; }

    public Long getGameId() { return gameId; }
    public void setGameId(Long gameId) { this.gameId = gameId; }

    public LocalDate getPlayedAt() { return playedAt; }
    public void setPlayedAt(LocalDate playedAt) { this.playedAt = playedAt; }
}
