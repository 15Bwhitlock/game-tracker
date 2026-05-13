CREATE TABLE games (
    id                       BIGSERIAL PRIMARY KEY,
    bgg_id                   INTEGER,
    title                    VARCHAR(255)        NOT NULL,
    min_players              INT                 NOT NULL,
    max_players              INT                 NOT NULL,
    min_play_time_minutes    INT                 NOT NULL,
    max_play_time_minutes    INT                 NOT NULL,
    complexity_weight        DOUBLE PRECISION,
    thumbnail_url            VARCHAR(1024),
    owned_since              DATE,
    personal_rating          INT,
    notes                    TEXT,
    last_played_at           DATE,
    CONSTRAINT chk_player_range  CHECK (min_players <= max_players),
    CONSTRAINT chk_time_range    CHECK (min_play_time_minutes <= max_play_time_minutes),
    CONSTRAINT chk_rating_range  CHECK (personal_rating IS NULL OR (personal_rating BETWEEN 1 AND 10)),
    CONSTRAINT chk_complexity    CHECK (complexity_weight IS NULL OR (complexity_weight BETWEEN 0.0 AND 5.0))
);

CREATE INDEX idx_games_title ON games (LOWER(title));
CREATE UNIQUE INDEX idx_games_bgg_id ON games (bgg_id) WHERE bgg_id IS NOT NULL;

CREATE TABLE game_categories (
    game_id  BIGINT       NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    category VARCHAR(255) NOT NULL
);

CREATE INDEX idx_game_categories_game_id ON game_categories (game_id);
CREATE INDEX idx_game_categories_category ON game_categories (category);

CREATE TABLE game_mechanics (
    game_id  BIGINT       NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    mechanic VARCHAR(255) NOT NULL
);

CREATE INDEX idx_game_mechanics_game_id ON game_mechanics (game_id);
CREATE INDEX idx_game_mechanics_mechanic ON game_mechanics (mechanic);
