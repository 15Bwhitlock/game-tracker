ALTER TABLE game_categories ADD COLUMN position INT;
UPDATE game_categories gc
SET position = sub.rn - 1
FROM (
    SELECT ctid, row_number() OVER (PARTITION BY game_id ORDER BY ctid) AS rn
    FROM game_categories
) sub
WHERE gc.ctid = sub.ctid;
ALTER TABLE game_categories ALTER COLUMN position SET NOT NULL;
ALTER TABLE game_categories ADD CONSTRAINT pk_game_categories PRIMARY KEY (game_id, position);

ALTER TABLE game_mechanics ADD COLUMN position INT;
UPDATE game_mechanics gm
SET position = sub.rn - 1
FROM (
    SELECT ctid, row_number() OVER (PARTITION BY game_id ORDER BY ctid) AS rn
    FROM game_mechanics
) sub
WHERE gm.ctid = sub.ctid;
ALTER TABLE game_mechanics ALTER COLUMN position SET NOT NULL;
ALTER TABLE game_mechanics ADD CONSTRAINT pk_game_mechanics PRIMARY KEY (game_id, position);
