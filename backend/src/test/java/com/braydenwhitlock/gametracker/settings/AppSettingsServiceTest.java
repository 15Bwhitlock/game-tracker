package com.braydenwhitlock.gametracker.settings;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class AppSettingsServiceTest {

    private AppSettingsRepository repository;
    private AppSettingsService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(AppSettingsRepository.class);
        service = new AppSettingsService(repository);
    }

    @Test
    void getReturnsTheSeededRow() {
        AppSettings settings = new AppSettings();
        settings.setId(1L);
        when(repository.findById(1L)).thenReturn(Optional.of(settings));

        assertThat(service.get()).isSameAs(settings);
    }

    @Test
    void getThrowsIfTheSeededRowIsSomehowMissing() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get()).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void markDictionaryViewedStampsTheCurrentTime() {
        AppSettings settings = new AppSettings();
        settings.setId(1L);
        when(repository.findById(1L)).thenReturn(Optional.of(settings));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Instant before = Instant.now();
        AppSettings updated = service.markDictionaryViewed();
        Instant after = Instant.now();

        assertThat(updated.getDictionaryLastViewedAt()).isBetween(before, after);
    }
}
