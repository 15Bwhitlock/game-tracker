-- Add "Cooperative Play" mechanic to any game that has "Cooperative" as a category but not already as a mechanic.
INSERT INTO game_mechanics (game_id, mechanic, position)
SELECT gc.game_id, 'Cooperative Play', COALESCE((SELECT MAX(gm.position) + 1 FROM game_mechanics gm WHERE gm.game_id = gc.game_id), 0)
FROM game_categories gc
WHERE gc.category = 'Cooperative'
  AND NOT EXISTS (
    SELECT 1 FROM game_mechanics gm
    WHERE gm.game_id = gc.game_id AND gm.mechanic = 'Cooperative Play'
  );

-- Remove Cooperative from all categories.
DELETE FROM game_categories WHERE category = 'Cooperative';

-- Renumber positions to close any gaps left by the deletion.
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
