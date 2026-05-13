-- Seed data: popular board games for development and first-run experience
-- ON CONFLICT DO NOTHING keeps this safe if any of these were added manually
INSERT INTO games (bgg_id, title, min_players, max_players, min_play_time_minutes, max_play_time_minutes, complexity_weight, personal_rating, notes)
VALUES
  (13,    'Catan',            3, 4, 60,  120, 2.3, 8,  'Classic gateway game. Best with 4 players.'),
  (9209,  'Ticket to Ride',   2, 5, 45,  75,  1.9, 8,  'Great intro game for new players.'),
  (30549, 'Pandemic',         2, 4, 45,  75,  2.4, 9,  'Tense cooperative experience. Try On the Brink expansion.'),
  (178900,'Codenames',        2, 8, 15,  30,  1.4, 9,  'Perfect party game. Works with any group.'),
  (822,   'Carcassonne',      2, 5, 30,  60,  1.9, 7,  'Easy to learn, satisfying to play.'),
  (68448, '7 Wonders',        2, 7, 30,  60,  2.3, 8,  'Scales surprisingly well across all player counts.'),
  (230802,'Azul',             2, 4, 30,  45,  1.8, 9,  'Beautiful components. Deceptively strategic.'),
  (266192,'Wingspan',         1, 5, 40,  70,  2.5, 9,  'Relaxing engine builder with stunning artwork.')
ON CONFLICT DO NOTHING;

-- Categories
INSERT INTO game_categories (game_id, category, position)
SELECT id, 'Strategy',    0 FROM games WHERE title = 'Catan'           UNION ALL
SELECT id, 'Negotiation', 1 FROM games WHERE title = 'Catan'           UNION ALL
SELECT id, 'Family',      0 FROM games WHERE title = 'Ticket to Ride'  UNION ALL
SELECT id, 'Strategy',    1 FROM games WHERE title = 'Ticket to Ride'  UNION ALL
SELECT id, 'Cooperative', 0 FROM games WHERE title = 'Pandemic'        UNION ALL
SELECT id, 'Strategy',    1 FROM games WHERE title = 'Pandemic'        UNION ALL
SELECT id, 'Party',       0 FROM games WHERE title = 'Codenames'       UNION ALL
SELECT id, 'Word',        1 FROM games WHERE title = 'Codenames'       UNION ALL
SELECT id, 'Social Deduction', 2 FROM games WHERE title = 'Codenames'  UNION ALL
SELECT id, 'Family',      0 FROM games WHERE title = 'Carcassonne'     UNION ALL
SELECT id, 'Strategy',    1 FROM games WHERE title = 'Carcassonne'     UNION ALL
SELECT id, 'Strategy',    0 FROM games WHERE title = '7 Wonders'       UNION ALL
SELECT id, 'Card Game',   1 FROM games WHERE title = '7 Wonders'       UNION ALL
SELECT id, 'Abstract',    0 FROM games WHERE title = 'Azul'            UNION ALL
SELECT id, 'Family',      1 FROM games WHERE title = 'Azul'            UNION ALL
SELECT id, 'Strategy',    0 FROM games WHERE title = 'Wingspan'        UNION ALL
SELECT id, 'Family',      1 FROM games WHERE title = 'Wingspan'
ON CONFLICT DO NOTHING;

-- Mechanics
INSERT INTO game_mechanics (game_id, mechanic, position)
SELECT id, 'Dice Rolling',       0 FROM games WHERE title = 'Catan'           UNION ALL
SELECT id, 'Trading',            1 FROM games WHERE title = 'Catan'           UNION ALL
SELECT id, 'Resource Management',2 FROM games WHERE title = 'Catan'           UNION ALL
SELECT id, 'Route Building',     0 FROM games WHERE title = 'Ticket to Ride'  UNION ALL
SELECT id, 'Set Collection',     1 FROM games WHERE title = 'Ticket to Ride'  UNION ALL
SELECT id, 'Card Drafting',      2 FROM games WHERE title = 'Ticket to Ride'  UNION ALL
SELECT id, 'Cooperative Play',   0 FROM games WHERE title = 'Pandemic'        UNION ALL
SELECT id, 'Hand Management',    1 FROM games WHERE title = 'Pandemic'        UNION ALL
SELECT id, 'Action Points',      2 FROM games WHERE title = 'Pandemic'        UNION ALL
SELECT id, 'Word',               0 FROM games WHERE title = 'Codenames'       UNION ALL
SELECT id, 'Deduction',          1 FROM games WHERE title = 'Codenames'       UNION ALL
SELECT id, 'Tile Placement',     0 FROM games WHERE title = 'Carcassonne'     UNION ALL
SELECT id, 'Area Control',       1 FROM games WHERE title = 'Carcassonne'     UNION ALL
SELECT id, 'Card Drafting',      0 FROM games WHERE title = '7 Wonders'       UNION ALL
SELECT id, 'Tableau Building',   1 FROM games WHERE title = '7 Wonders'       UNION ALL
SELECT id, 'Resource Management',2 FROM games WHERE title = '7 Wonders'       UNION ALL
SELECT id, 'Pattern Building',   0 FROM games WHERE title = 'Azul'            UNION ALL
SELECT id, 'Tile Placement',     1 FROM games WHERE title = 'Azul'            UNION ALL
SELECT id, 'Engine Building',    0 FROM games WHERE title = 'Wingspan'        UNION ALL
SELECT id, 'Card Drafting',      1 FROM games WHERE title = 'Wingspan'        UNION ALL
SELECT id, 'Hand Management',    2 FROM games WHERE title = 'Wingspan'
ON CONFLICT DO NOTHING;
