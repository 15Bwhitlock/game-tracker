-- Tracks when the Dictionary page was last viewed, so "From Your Collection"
-- entries created since then can be marked "New" (see AppSettingsService).
-- Null until the first visit — treated as "everything is new" by the frontend.
ALTER TABLE app_settings ADD COLUMN dictionary_last_viewed_at TIMESTAMPTZ;
