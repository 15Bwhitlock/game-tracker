package com.braydenwhitlock.gametracker.tagdescription;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Set;

@Service
@Transactional
public class TagDescriptionService {

    private static final Logger log = LoggerFactory.getLogger(TagDescriptionService.class);

    private final TagDescriptionRepository repository;
    private final TransactionTemplate requiresNewTransaction;

    public TagDescriptionService(
            TagDescriptionRepository repository,
            PlatformTransactionManager transactionManager
    ) {
        this.repository = repository;
        this.requiresNewTransaction = new TransactionTemplate(transactionManager);
        this.requiresNewTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional(readOnly = true)
    public List<TagDescription> findAll() {
        return repository.findAll();
    }

    /**
     * Makes sure a category/mechanic name that isn't a curated preset has a row, so it
     * shows up on the Dictionary page as "Not yet described" for the user to fill in.
     * Does nothing for presets or names that already have a row.
     */
    public void ensureDescribed(String name, TagType type) {
        if (name == null || name.isBlank()) {
            return;
        }
        Set<String> presets = type == TagType.CATEGORY ? PresetTagNames.CATEGORIES : PresetTagNames.MECHANICS;
        if (presets.contains(name) || repository.findByNameIgnoreCaseAndType(name, type).isPresent()) {
            return;
        }
        save(name, type);
    }

    /**
     * Saves a brand-new row in its own transaction (PROPAGATION_REQUIRES_NEW). Two
     * requests can genuinely race to describe the exact same new name at once — e.g.
     * the Collection page's bulk-tag action saves several games with the same new
     * category concurrently. Both see "no existing row" and try to insert; the unique
     * index on (lower(name), type) rejects the loser. Running this in its own
     * transaction, flushed immediately, means that failure is caught and swallowed
     * here — a lost race is a no-op, not a reason to fail the caller's real work (e.g.
     * saving a game) — instead of poisoning the caller's own transaction.
     */
    private void save(String name, TagType type) {
        try {
            requiresNewTransaction.executeWithoutResult(status -> {
                TagDescription tag = new TagDescription();
                tag.setName(name);
                tag.setType(type);
                tag.setSource(TagSource.PENDING);
                tag.setCreatedAt(Instant.now());
                repository.saveAndFlush(tag);
            });
        } catch (DataIntegrityViolationException e) {
            log.debug("Lost the race to describe '{}' ({}) — another request already created it.", name, type);
        }
    }

    public TagDescription updateDescription(Long id, String description) {
        TagDescription tag = repository.findById(id).orElseThrow(() -> new TagDescriptionNotFoundException(id));
        tag.setDescription(description);
        tag.setSource(TagSource.USER);
        return repository.save(tag);
    }

    /**
     * Creates or updates the user's override of a curated entry (a preset category or
     * mechanic, or a glossary term) — the static default lives in the frontend, so the
     * first edit has no row yet. Always marked USER; deleting the row reverts to the default.
     */
    public TagDescription upsertOverride(String name, TagType type, String description) {
        TagDescription tag = repository.findByNameIgnoreCaseAndType(name, type).orElseGet(() -> {
            TagDescription created = new TagDescription();
            created.setName(name);
            created.setType(type);
            created.setCreatedAt(Instant.now());
            return created;
        });
        tag.setDescription(description);
        tag.setSource(TagSource.USER);
        return repository.save(tag);
    }

    /** Removes every "Not yet described" placeholder; they reappear when a game with that name is next saved. */
    public int deletePending() {
        List<TagDescription> rows = repository.findAll().stream()
                .filter(t -> t.getSource() == TagSource.PENDING).toList();
        repository.deleteAll(rows);
        return rows.size();
    }

    /** Removes the user's edits of curated entries (presets and glossary terms), restoring the shipped text. */
    public int deleteOverrides() {
        List<TagDescription> rows = repository.findAll().stream().filter(this::isOverride).toList();
        repository.deleteAll(rows);
        return rows.size();
    }

    private boolean isOverride(TagDescription t) {
        if (t.getType() == TagType.GLOSSARY) {
            return true;
        }
        Set<String> presets = t.getType() == TagType.CATEGORY ? PresetTagNames.CATEGORIES : PresetTagNames.MECHANICS;
        return presets.stream().anyMatch(p -> p.equalsIgnoreCase(t.getName()));
    }

    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new TagDescriptionNotFoundException(id);
        }
        repository.deleteById(id);
    }
}
