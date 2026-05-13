package com.braydenwhitlock.gametracker.game;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Database access for the games table.
 *
 * JpaRepository<Game, Long> auto-provides all standard CRUD operations:
 *   - findAll()       → SELECT * FROM games
 *   - findById(id)    → SELECT * FROM games WHERE id = ?
 *   - save(game)      → INSERT or UPDATE depending on whether id is set
 *   - deleteById(id)  → DELETE FROM games WHERE id = ?
 *   - existsById(id)  → SELECT COUNT(*) FROM games WHERE id = ?
 *
 * No custom queries are needed here yet — the filtering for suggestions
 * is done in Java (in SuggestionService) rather than in SQL, which is
 * fine for a personal collection that'll stay small.
 */
public interface GameRepository extends JpaRepository<Game, Long> {
}
