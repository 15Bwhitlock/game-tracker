-- BGG provides both of these on every /thing lookup, but until now the app only
-- stored the small thumbnail and discarded year_published/the full-size image
-- entirely. Both nullable — neither applies to manually-added games with no BGG id.
ALTER TABLE games ADD COLUMN year_published INT NULL;
ALTER TABLE games ADD COLUMN image_url VARCHAR(1024) NULL;
