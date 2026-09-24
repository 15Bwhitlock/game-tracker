-- AI-written tag descriptions were removed: descriptions are now always written by hand.
ALTER TABLE app_settings DROP COLUMN ai_enabled;
-- Any AI-authored text becomes the user's own (they can still edit or delete it).
UPDATE tag_descriptions SET source = 'USER' WHERE source = 'AI';
