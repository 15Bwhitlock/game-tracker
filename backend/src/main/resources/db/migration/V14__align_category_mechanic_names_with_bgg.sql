-- Renames several preset categories/mechanics to match BoardGameGeek's actual current
-- taxonomy terms (discovered by comparing this app's presets against the real
-- categories/mechanics pulled in from BGG-linked games in the collection). Plain
-- renames within the same table use a NOT EXISTS guard + cleanup DELETE, in case a
-- game somehow already carries both the old and new name for the same slot.

-- Categories
UPDATE game_categories gc1 SET category = 'Party Game'
WHERE gc1.category = 'Party'
  AND NOT EXISTS (SELECT 1 FROM game_categories gc2 WHERE gc2.game_id = gc1.game_id AND gc2.category = 'Party Game');
DELETE FROM game_categories WHERE category = 'Party';

UPDATE game_categories gc1 SET category = 'Abstract Strategy'
WHERE gc1.category = 'Abstract'
  AND NOT EXISTS (SELECT 1 FROM game_categories gc2 WHERE gc2.game_id = gc1.game_id AND gc2.category = 'Abstract Strategy');
DELETE FROM game_categories WHERE category = 'Abstract';

UPDATE game_categories gc1 SET category = 'Dice'
WHERE gc1.category = 'Dice Game'
  AND NOT EXISTS (SELECT 1 FROM game_categories gc2 WHERE gc2.game_id = gc1.game_id AND gc2.category = 'Dice');
DELETE FROM game_categories WHERE category = 'Dice Game';

UPDATE game_categories gc1 SET category = 'Children''s Game'
WHERE gc1.category = 'Children''s'
  AND NOT EXISTS (SELECT 1 FROM game_categories gc2 WHERE gc2.game_id = gc1.game_id AND gc2.category = 'Children''s Game');
DELETE FROM game_categories WHERE category = 'Children''s';

UPDATE game_categories gc1 SET category = 'Word Game'
WHERE gc1.category = 'Word'
  AND NOT EXISTS (SELECT 1 FROM game_categories gc2 WHERE gc2.game_id = gc1.game_id AND gc2.category = 'Word Game');
DELETE FROM game_categories WHERE category = 'Word';

-- Mechanics
UPDATE game_mechanics gm1 SET mechanic = 'Deck, Bag, and Pool Building'
WHERE gm1.mechanic = 'Deck Building'
  AND NOT EXISTS (SELECT 1 FROM game_mechanics gm2 WHERE gm2.game_id = gm1.game_id AND gm2.mechanic = 'Deck, Bag, and Pool Building');
DELETE FROM game_mechanics WHERE mechanic = 'Deck Building';

UPDATE game_mechanics gm1 SET mechanic = 'Cooperative Game'
WHERE gm1.mechanic = 'Cooperative Play'
  AND NOT EXISTS (SELECT 1 FROM game_mechanics gm2 WHERE gm2.game_id = gm1.game_id AND gm2.mechanic = 'Cooperative Game');
DELETE FROM game_mechanics WHERE mechanic = 'Cooperative Play';

UPDATE game_mechanics gm1 SET mechanic = 'Solo / Solitaire Game'
WHERE gm1.mechanic = 'Solo / Solitaire'
  AND NOT EXISTS (SELECT 1 FROM game_mechanics gm2 WHERE gm2.game_id = gm1.game_id AND gm2.mechanic = 'Solo / Solitaire Game');
DELETE FROM game_mechanics WHERE mechanic = 'Solo / Solitaire';

UPDATE game_mechanics gm1 SET mechanic = 'Scenario / Mission / Campaign Game'
WHERE gm1.mechanic = 'Scenario / Mission'
  AND NOT EXISTS (SELECT 1 FROM game_mechanics gm2 WHERE gm2.game_id = gm1.game_id AND gm2.mechanic = 'Scenario / Mission / Campaign Game');
DELETE FROM game_mechanics WHERE mechanic = 'Scenario / Mission';

UPDATE game_mechanics gm1 SET mechanic = 'Point to Point Movement'
WHERE gm1.mechanic = 'Point-to-Point Movement'
  AND NOT EXISTS (SELECT 1 FROM game_mechanics gm2 WHERE gm2.game_id = gm1.game_id AND gm2.mechanic = 'Point to Point Movement');
DELETE FROM game_mechanics WHERE mechanic = 'Point-to-Point Movement';

UPDATE game_mechanics gm1 SET mechanic = 'Trick-taking'
WHERE gm1.mechanic = 'Trick Taking'
  AND NOT EXISTS (SELECT 1 FROM game_mechanics gm2 WHERE gm2.game_id = gm1.game_id AND gm2.mechanic = 'Trick-taking');
DELETE FROM game_mechanics WHERE mechanic = 'Trick Taking';

-- "Deck Building" as a category is really a mechanic concept (BGG has no such
-- category) — migrate it across tables rather than just renaming it in place,
-- mirroring V7/V8/V10's category-to-mechanic pattern.
INSERT INTO game_mechanics (game_id, mechanic, position)
SELECT gc.game_id, 'Deck, Bag, and Pool Building',
       COALESCE((SELECT MAX(gm.position) + 1 FROM game_mechanics gm WHERE gm.game_id = gc.game_id), 0)
FROM game_categories gc
WHERE gc.category = 'Deck Building'
  AND NOT EXISTS (
    SELECT 1 FROM game_mechanics gm
    WHERE gm.game_id = gc.game_id AND gm.mechanic = 'Deck, Bag, and Pool Building'
  );
DELETE FROM game_categories WHERE category = 'Deck Building';

-- Renumber positions to close any gaps left by the deletions above.
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
