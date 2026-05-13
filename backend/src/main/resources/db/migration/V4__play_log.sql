CREATE TABLE game_plays (
    id        BIGSERIAL PRIMARY KEY,
    game_id   BIGINT  NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    played_at DATE    NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_game_plays_game_id ON game_plays(game_id);
