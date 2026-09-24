package com.braydenwhitlock.gametracker.tagdescription;

import com.braydenwhitlock.gametracker.ai.AnthropicClient;
import com.braydenwhitlock.gametracker.settings.AppSettingsService;
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
import java.util.Optional;
import java.util.Set;

@Service
@Transactional
public class TagDescriptionService {

    private static final Logger log = LoggerFactory.getLogger(TagDescriptionService.class);

    private final TagDescriptionRepository repository;
    private final AnthropicClient anthropicClient;
    private final AppSettingsService appSettingsService;
    private final TransactionTemplate requiresNewTransaction;

    public TagDescriptionService(
            TagDescriptionRepository repository,
            AnthropicClient anthropicClient,
            AppSettingsService appSettingsService,
            PlatformTransactionManager transactionManager
    ) {
        this.repository = repository;
        this.anthropicClient = anthropicClient;
        this.appSettingsService = appSettingsService;
        this.requiresNewTransaction = new TransactionTemplate(transactionManager);
        this.requiresNewTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional(readOnly = true)
    public List<TagDescription> findAll() {
        return repository.findAll();
    }

    /**
     * If {@code name} is already a curated preset, does nothing. Otherwise:
     * <ul>
     *   <li>no existing row, AI available — asks Claude to write one and saves it only on
     *       a successful (non-empty) response, so a transient failure just means "try
     *       again the next time this name is saved," never a permanently blank row.</li>
     *   <li>no existing row, AI unavailable (toggled off in settings, or no
     *       {@code ANTHROPIC_API_KEY} configured) — saves a PENDING placeholder with no
     *       description, so the name still shows up on the Dictionary page for the user
     *       to describe manually.</li>
     *   <li>existing PENDING row, AI now available — backfills it via Claude, same as a
     *       new name (covers "I turned AI on after opting out for a while").</li>
     *   <li>existing row with a description (AI- or user-written) — does nothing.</li>
     * </ul>
     */
    public void ensureDescribed(String name, TagType type) {
        if (name == null || name.isBlank()) {
            return;
        }
        Set<String> presets = type == TagType.CATEGORY ? PresetTagNames.CATEGORIES : PresetTagNames.MECHANICS;
        if (presets.contains(name)) {
            return;
        }

        Optional<TagDescription> existing = repository.findByNameIgnoreCaseAndType(name, type);
        if (existing.isPresent()) {
            TagDescription tag = existing.get();
            if (isBlank(tag.getDescription()) && aiAvailable()) {
                anthropicClient.describeTag(name, kindLabel(type)).ifPresent(description -> {
                    tag.setDescription(description);
                    tag.setSource(TagSource.AI);
                    repository.save(tag);
                });
            }
            return;
        }

        if (aiAvailable()) {
            anthropicClient.describeTag(name, kindLabel(type))
                    .ifPresent(description -> save(name, type, description, TagSource.AI));
        } else {
            save(name, type, null, TagSource.PENDING);
        }
    }

    private boolean aiAvailable() {
        return appSettingsService.get().isAiEnabled() && anthropicClient.isConfigured();
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
    private void save(String name, TagType type, String description, TagSource source) {
        try {
            requiresNewTransaction.executeWithoutResult(status -> {
                TagDescription tag = new TagDescription();
                tag.setName(name);
                tag.setType(type);
                tag.setDescription(description);
                tag.setSource(source);
                tag.setCreatedAt(Instant.now());
                repository.saveAndFlush(tag);
            });
        } catch (DataIntegrityViolationException e) {
            log.debug("Lost the race to describe '{}' ({}) — another request already created it.", name, type);
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String kindLabel(TagType type) {
        return type == TagType.CATEGORY ? "category" : "mechanic";
    }

    public TagDescription updateDescription(Long id, String description) {
        TagDescription tag = repository.findById(id).orElseThrow(() -> new TagDescriptionNotFoundException(id));
        tag.setDescription(description);
        tag.setSource(TagSource.USER);
        return repository.save(tag);
    }

    public void delete(Long id) {
        if (!repository.existsById(id)) {
            throw new TagDescriptionNotFoundException(id);
        }
        repository.deleteById(id);
    }
}
