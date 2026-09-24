CREATE TABLE app_settings (
    id BIGINT PRIMARY KEY,
    ai_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- Single settings row, always id=1 — see AppSettingsService.
INSERT INTO app_settings (id, ai_enabled) VALUES (1, TRUE);
