package com.braydenwhitlock.gametracker.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * App-wide settings. A single row (id=1, seeded by migration V19) — not a per-user
 * table, since this is a personal single-collection app.
 */
@Entity
@Table(name = "app_settings")
public class AppSettings {

    @Id
    private Long id;

    @Column(name = "ai_enabled", nullable = false)
    private boolean aiEnabled;

    // Null until the Dictionary page has ever been viewed — see AppSettingsService.
    @Column(name = "dictionary_last_viewed_at")
    private Instant dictionaryLastViewedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public boolean isAiEnabled() { return aiEnabled; }
    public void setAiEnabled(boolean aiEnabled) { this.aiEnabled = aiEnabled; }

    public Instant getDictionaryLastViewedAt() { return dictionaryLastViewedAt; }
    public void setDictionaryLastViewedAt(Instant dictionaryLastViewedAt) { this.dictionaryLastViewedAt = dictionaryLastViewedAt; }
}
