package com.braydenwhitlock.gametracker.settings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@Transactional
public class AppSettingsService {

    private static final long SETTINGS_ID = 1L;

    private final AppSettingsRepository repository;

    public AppSettingsService(AppSettingsRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public AppSettings get() {
        // Seeded by migration V19 — always present.
        return repository.findById(SETTINGS_ID)
                .orElseThrow(() -> new IllegalStateException("app_settings row is missing"));
    }

    public AppSettings updateAiEnabled(boolean aiEnabled) {
        AppSettings settings = get();
        settings.setAiEnabled(aiEnabled);
        return repository.save(settings);
    }

    /**
     * Stamps "now" as the Dictionary page's last-viewed time. Call this once per
     * page load, after reading the previous value to decide which entries are
     * "New" for that render — the server always writes its own clock, never a
     * client-supplied timestamp.
     */
    public AppSettings markDictionaryViewed() {
        AppSettings settings = get();
        settings.setDictionaryLastViewedAt(Instant.now());
        return repository.save(settings);
    }
}
