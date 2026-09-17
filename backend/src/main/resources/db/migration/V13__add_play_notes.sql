-- Optional per-play notes (e.g. "played the Seafarers expansion", "taught 2 new
-- players"). Play sessions previously only recorded a date.
ALTER TABLE game_plays ADD COLUMN notes TEXT NULL;
