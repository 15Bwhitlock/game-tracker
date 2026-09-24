package com.braydenwhitlock.gametracker.tagdescription;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TagDescriptionServiceTest {

    private TagDescriptionRepository repository;
    private TagDescriptionService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(TagDescriptionRepository.class);
        PlatformTransactionManager transactionManager = Mockito.mock(PlatformTransactionManager.class);
        when(transactionManager.getTransaction(any())).thenReturn(Mockito.mock(TransactionStatus.class));
        service = new TagDescriptionService(repository, transactionManager);
    }

    private static TagDescription row(Long id, String name, TagType type, TagSource source) {
        TagDescription t = new TagDescription();
        t.setId(id);
        t.setName(name);
        t.setType(type);
        t.setSource(source);
        return t;
    }

    @Test
    void skipsAPresetNameWithoutTouchingTheRepository() {
        service.ensureDescribed("Strategy", TagType.CATEGORY);

        verify(repository, never()).findByNameIgnoreCaseAndType(any(), any());
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void skipsANameThatAlreadyHasARow() {
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC))
                .thenReturn(Optional.of(new TagDescription()));

        service.ensureDescribed("Take That", TagType.MECHANIC);

        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void savesAPendingPlaceholderForAGenuinelyNewName() {
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC)).thenReturn(Optional.empty());

        service.ensureDescribed("Take That", TagType.MECHANIC);

        verify(repository).saveAndFlush(argThat(tag ->
                tag.getName().equals("Take That")
                        && tag.getType() == TagType.MECHANIC
                        && tag.getDescription() == null
                        && tag.getSource() == TagSource.PENDING));
    }

    @Test
    void ignoresBlankNames() {
        service.ensureDescribed("  ", TagType.CATEGORY);
        service.ensureDescribed(null, TagType.CATEGORY);

        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void swallowsAUniqueConstraintViolationWhenTwoRequestsRaceToDescribeTheSameNewName() {
        // The Collection page's bulk-tag action saves several games with the same new
        // category concurrently; the unique index rejects the loser. That must never
        // fail the caller's real work (e.g. GameService.update saving the game itself).
        when(repository.findByNameIgnoreCaseAndType("Take That", TagType.MECHANIC)).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("duplicate key"));

        assertThatCode(() -> service.ensureDescribed("Take That", TagType.MECHANIC)).doesNotThrowAnyException();
    }

    @Test
    void updateDescriptionMarksTheRowUserEdited() {
        TagDescription tag = row(1L, "X", TagType.CATEGORY, TagSource.PENDING);
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
    void upsertOverrideCreatesAUserRowWhenNoneExists() {
        when(repository.findByNameIgnoreCaseAndType("Strategy", TagType.CATEGORY)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        TagDescription saved = service.upsertOverride("Strategy", TagType.CATEGORY, "My take");

        assertThat(saved.getName()).isEqualTo("Strategy");
        assertThat(saved.getDescription()).isEqualTo("My take");
        assertThat(saved.getSource()).isEqualTo(TagSource.USER);
        assertThat(saved.getCreatedAt()).isNotNull();
    }

    @Test
    void upsertOverrideUpdatesTheExistingRowInPlace() {
        TagDescription existing = row(5L, "Strategy", TagType.CATEGORY, TagSource.USER);
        existing.setDescription("old");
        when(repository.findByNameIgnoreCaseAndType("Strategy", TagType.CATEGORY)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        TagDescription saved = service.upsertOverride("Strategy", TagType.CATEGORY, "new");

        assertThat(saved.getId()).isEqualTo(5L);
        assertThat(saved.getDescription()).isEqualTo("new");
    }

    @Test
    void deletePendingRemovesOnlyPlaceholders() {
        TagDescription pending = row(1L, "Zzz", TagType.CATEGORY, TagSource.PENDING);
        TagDescription written = row(2L, "Yyy", TagType.CATEGORY, TagSource.USER);
        when(repository.findAll()).thenReturn(List.of(pending, written));

        assertThat(service.deletePending()).isEqualTo(1);

        verify(repository).deleteAll(List.of(pending));
    }

    @Test
    void deleteOverridesRemovesPresetAndGlossaryEditsButKeepsLearnedTags() {
        TagDescription presetEdit = row(1L, "strategy", TagType.CATEGORY, TagSource.USER);
        TagDescription glossaryEdit = row(2L, "Filler", TagType.GLOSSARY, TagSource.USER);
        TagDescription learned = row(3L, "Zzz Custom", TagType.CATEGORY, TagSource.USER);
        when(repository.findAll()).thenReturn(List.of(presetEdit, glossaryEdit, learned));

        assertThat(service.deleteOverrides()).isEqualTo(2);

        verify(repository).deleteAll(List.of(presetEdit, glossaryEdit));
    }

    @Test
    void deleteRemovesAnExistingRow() {
        when(repository.existsById(1L)).thenReturn(true);

        service.delete(1L);

        verify(repository).deleteById(1L);
    }

    @Test
    void deleteThrowsWhenNotFound() {
        when(repository.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> service.delete(99L))
                .isInstanceOf(TagDescriptionNotFoundException.class);
    }
}
