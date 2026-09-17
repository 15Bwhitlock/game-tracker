-- BGG's "suggested_numplayers" poll-summary names the player count(s) the community
-- considers best for a game. Stored as a child table (like game_categories/game_mechanics)
-- rather than a column, since a game can have more than one "best" count.
CREATE TABLE game_best_player_counts (
    game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    position INT NOT NULL,
    player_count INT NOT NULL,
    PRIMARY KEY (game_id, position)
);
