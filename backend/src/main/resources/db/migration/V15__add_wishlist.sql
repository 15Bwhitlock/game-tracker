-- Wishlist: games the user doesn't own yet, kept for future reference. Lighter than
-- "games" — no play-tracking columns (owned_since, personal_rating, last_played_at,
-- favorite, series_name) since none of that applies before a game is actually owned.
CREATE TABLE wishlist_items (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bgg_id                   INTEGER,
    title                    VARCHAR(255) NOT NULL,
    thumbnail_url            VARCHAR(1024),
    image_url                VARCHAR(1024),
    year_published           INT,
    min_players              INT,
    max_players              INT,
    min_play_time_minutes    INT,
    max_play_time_minutes    INT,
    complexity_weight        DOUBLE PRECISION,
    notes                    TEXT,
    added_at                 DATE NOT NULL
);

-- Same partial unique index as games.bgg_id — prevents wishlisting the same BGG
-- game twice, while still allowing any number of manually-added (null bgg_id) entries.
CREATE UNIQUE INDEX idx_wishlist_items_bgg_id ON wishlist_items (bgg_id) WHERE bgg_id IS NOT NULL;

CREATE TABLE wishlist_categories (
    item_id  BIGINT NOT NULL REFERENCES wishlist_items (id) ON DELETE CASCADE,
    position INT    NOT NULL,
    category VARCHAR(255) NOT NULL,
    PRIMARY KEY (item_id, position)
);

CREATE TABLE wishlist_mechanics (
    item_id  BIGINT NOT NULL REFERENCES wishlist_items (id) ON DELETE CASCADE,
    position INT    NOT NULL,
    mechanic VARCHAR(255) NOT NULL,
    PRIMARY KEY (item_id, position)
);

CREATE INDEX idx_wishlist_categories_item_id ON wishlist_categories (item_id);
CREATE INDEX idx_wishlist_mechanics_item_id ON wishlist_mechanics (item_id);
