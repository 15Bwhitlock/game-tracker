-- Add Deduction mechanic to any game that has it as a category but not already as a mechanic.
-- Position is set to one after the current highest position for that game's mechanics.
INSERT INTO game_mechanics (game_id, mechanic, position)
SELECT gc.game_id, 'Deduction', COALESCE((SELECT MAX(gm.position) + 1 FROM game_mechanics gm WHERE gm.game_id = gc.game_id), 0)
FROM game_categories gc
WHERE gc.category = 'Deduction'
  AND NOT EXISTS (
    SELECT 1 FROM game_mechanics gm
    WHERE gm.game_id = gc.game_id AND gm.mechanic = 'Deduction'
  );

-- Remove Deduction from all categories.
DELETE FROM game_categories WHERE category = 'Deduction';
