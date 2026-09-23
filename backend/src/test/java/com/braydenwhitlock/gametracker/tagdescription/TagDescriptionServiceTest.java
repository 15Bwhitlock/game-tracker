package com.braydenwhitlock.gametracker.tagdescription;

import com.braydenwhitlock.gametracker.ai.AnthropicClient;
import com.braydenwhitlock.gametracker.settings.AppSettings;
import com.braydenwhitlock.gametracker.settings.AppSettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TagDescriptionServiceTest {

    private TagDescriptionRepository repository;
    private AnthropicClient anthropicClient;
    private AppSettingsService appSettingsService;
    private TagDescriptionService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(TagDescriptionRepository.class);
        anthropicClient = Mockito.mock(AnthropicClient.class);
        appSettingsService = Mockito.mock(AppSettingsService.class);
        service = new TagDescriptionService(repository, anthropicClient, appSettingsService);

        // Default: AI on and configured — most tests care about the preset/existing-row
        // logic, not the toggle itself. Tests that care override this explicitly.
        AppSettings settings = new AppSettings();
        settings.setAiEnabled(true);
        when(appSettingsService.get()).thenReturn(settings);
        when(anthropicClient.isConfigured()).thenReturn(true);
    }

    @Test
    void skipsAPresetNameWithoutCallingTheAiOrTouchingTheRepository() {
        service.ensureDescribed("Strategy", TagType.CATEGORY);

        verify(anthropicClient, never()).describeTag(any(), any());
        verify(repository, never()).save(any());
    }

    @Test
    void skipsANameThatAlreadyHasADescription() {
        TagDescription existing = new TagDescription();
        existing.setDescription("Already written.");
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC))
                .thenReturn(Optional.of(existing));

        service.ensureDescribed("Take That", TagType.MECHANIC);

        verify(anthropicClient, never()).describeTag(any(), any());
        verify(repository, never()).save(any());
    }

    @Test
    void generatesAndSavesADescriptionForAGenuinelyNewName() {
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC))
                .thenReturn(Optional.empty());
        when(anthropicClient.describeTag("Take That", "mechanic"))
                .thenReturn(Optional.of("Players can directly hinder or damage each other."));

        service.ensureDescribed("Take That", TagType.MECHANIC);

        verify(repository).save(org.mockito.ArgumentMatchers.argThat(tag ->
                tag.getName().equals("Take That")
                        && tag.getType() == TagType.MECHANIC
                        && tag.getSource() == TagSource.AI
                        && tag.getDescription().equals("Players can directly hinder or damage each other.")));
    }

    @Test
    void doesNotSaveAnythingWhenTheAiCallFails() {
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC))
                .thenReturn(Optional.empty());
        when(anthropicClient.describeTag("Take That", "mechanic")).thenReturn(Optional.empty());

        service.ensureDescribed("Take That", TagType.MECHANIC);

        verify(repository, never()).save(any());
    }

    @Test
    void savesAPendingPlaceholderWhenAiIsToggledOffInsteadOfCallingTheAi() {
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC))
                .thenReturn(Optional.empty());
        AppSettings disabled = new AppSettings();
        disabled.setAiEnabled(false);
        when(appSettingsService.get()).thenReturn(disabled);

        service.ensureDescribed("Take That", TagType.MECHANIC);

        verify(anthropicClient, never()).describeTag(any(), any());
        verify(repository).save(org.mockito.ArgumentMatchers.argThat(tag ->
                tag.getName().equals("Take That")
                        && tag.getDescription() == null
                        && tag.getSource() == TagSource.PENDING));
    }

    @Test
    void savesAPendingPlaceholderWhenNoApiKeyIsConfiguredEvenIfTheToggleIsOn() {
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC))
                .thenReturn(Optional.empty());
        when(anthropicClient.isConfigured()).thenReturn(false);

        service.ensureDescribed("Take That", TagType.MECHANIC);

        verify(anthropicClient, never()).describeTag(any(), any());
        verify(repository).save(org.mockito.ArgumentMatchers.argThat(tag ->
                tag.getSource() == TagSource.PENDING));
    }

    @Test
    void backfillsAPendingRowViaAiOnceAiBecomesAvailableAgain() {
        TagDescription pending = new TagDescription();
        pending.setName("Take That");
        pending.setType(TagType.MECHANIC);
        pending.setDescription(null);
        pending.setSource(TagSource.PENDING);
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC))
                .thenReturn(Optional.of(pending));
        when(anthropicClient.describeTag("Take That", "mechanic"))
                .thenReturn(Optional.of("Players can directly hinder or damage each other."));

        service.ensureDescribed("Take That", TagType.MECHANIC);

        assertThat(pending.getDescription()).isEqualTo("Players can directly hinder or damage each other.");
        assertThat(pending.getSource()).isEqualTo(TagSource.AI);
        verify(repository).save(pending);
    }

    @Test
    void leavesAPendingRowAloneWhenAiIsStillUnavailable() {
        TagDescription pending = new TagDescription();
        pending.setName("Take That");
        pending.setType(TagType.MECHANIC);
        pending.setDescription(null);
        pending.setSource(TagSource.PENDING);
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC))
                .thenReturn(Optional.of(pending));
        AppSettings disabled = new AppSettings();
        disabled.setAiEnabled(false);
        when(appSettingsService.get()).thenReturn(disabled);

        service.ensureDescribed("Take That", TagType.MECHANIC);

        verify(anthropicClient, never()).describeTag(any(), any());
        verify(repository, never()).save(any());
    }

    @Test
    void updateDescriptionMarksTheRowUserEdited() {
        TagDescription tag = new TagDescription();
        tag.setId(1L);
        tag.setDescription("AI-written text");
        tag.setSource(TagSource.AI);
        when(repository.findById(1L)).thenReturn(Optional.of(tag));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        TagDescription updated = service.updateDescription(1L, "Corrected text");

        assertThat(updated.getDescription()).isEqualTo("Corrected text");
        assertThat(updated.getSource()).isEqualTo(TagSource.USER);
    }

    @Test
    void updateDescriptionThrowsWhenNotFound() {
        when(repository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateDescription(99L, "x"))
                .isInstanceOf(TagDescriptionNotFoundException.class);
    }

    @Test
    void deleteRemovesAnExistingRow() {
        when(repository.existsById(1L)).thenReturn(true);

        service.delete(1L);

        org.mockito.Mockito.verify(repository).deleteById(1L);
    }

    @Test
    void deleteThrowsWhenNotFound() {
        when(repository.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> service.delete(99L))
                .isInstanceOf(TagDescriptionNotFoundException.class);
    }
}
