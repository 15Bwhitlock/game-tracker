package com.braydenwhitlock.gametracker.tagdescription;

import com.braydenwhitlock.gametracker.ai.AnthropicClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;

@Service
@Transactional
public class TagDescriptionService {

    private final TagDescriptionRepository repository;
    private final AnthropicClient anthropicClient;

    public TagDescriptionService(TagDescriptionRepository repository, AnthropicClient anthropicClient) {
        this.repository = repository;
        this.anthropicClient = anthropicClient;
    }

    @Transactional(readOnly = true)
    public List<TagDescription> findAll() {
        return repository.findAll();
    }

    /**
     * If {@code name} is already a curated preset, or already has a description saved,
     * does nothing. Otherwise asks Claude to write one and persists it — only on a
     * successful (non-empty) response, so a transient failure just means "try again the
     * next time this name is saved," never a permanently blank row.
     */
    public void ensureDescribed(String name, TagType type) {
        if (name == null || name.isBlank()) {
            return;
        }
        Set<String> presets = type == TagType.CATEGORY ? PresetTagNames.CATEGORIES : PresetTagNames.MECHANICS;
        if (presets.contains(name)) {
            return;
        }
        if (repository.findByNameIgnoreCaseAndType(name, type).isPresent()) {
            return;
        }
        anthropicClient.describeTag(name, type == TagType.CATEGORY ? "category" : "mechanic")
                .ifPresent(description -> {
                    TagDescription tag = new TagDescription();
                    tag.setName(name);
                    tag.setType(type);
                    tag.setDescription(description);
                    tag.setSource(TagSource.AI);
                    tag.setCreatedAt(Instant.now());
                    repository.save(tag);
                });
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
