package com.braydenwhitlock.gametracker.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

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

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public boolean isAiEnabled() { return aiEnabled; }
    public void setAiEnabled(boolean aiEnabled) { this.aiEnabled = aiEnabled; }
}
