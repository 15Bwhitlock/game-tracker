-- Add Bluffing mechanic to any game that has it as a category but not already as a mechanic.
INSERT INTO game_mechanics (game_id, mechanic)
SELECT gc.game_id, 'Bluffing'
FROM game_categories gc
WHERE gc.category = 'Bluffing'
  AND NOT EXISTS (
    SELECT 1 FROM game_mechanics gm
    WHERE gm.game_id = gc.game_id AND gm.mechanic = 'Bluffing'
  );

-- Remove Bluffing from all categories.
DELETE FROM game_categories WHERE category = 'Bluffing';
