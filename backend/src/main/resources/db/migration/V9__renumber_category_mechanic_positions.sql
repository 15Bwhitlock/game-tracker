-- Re-number positions after deletions from V7/V8 left gaps, causing JPA to inject nulls.
WITH ranked AS (
  SELECT ctid, game_id, row_number() OVER (PARTITION BY game_id ORDER BY position) - 1 AS new_pos
  FROM game_categories
)
UPDATE game_categories gc
SET position = ranked.new_pos
FROM ranked
WHERE gc.ctid = ranked.ctid AND gc.position != ranked.new_pos;

WITH ranked AS (
  SELECT ctid, game_id, row_number() OVER (PARTITION BY game_id ORDER BY position) - 1 AS new_pos
  FROM game_mechanics
)
UPDATE game_mechanics gm
SET position = ranked.new_pos
FROM ranked
WHERE gm.ctid = ranked.ctid AND gm.position != ranked.new_pos;
