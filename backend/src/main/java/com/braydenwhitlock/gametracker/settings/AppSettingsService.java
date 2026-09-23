package com.braydenwhitlock.gametracker.settings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
}
