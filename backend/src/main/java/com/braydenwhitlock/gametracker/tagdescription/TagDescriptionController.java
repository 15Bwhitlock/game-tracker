package com.braydenwhitlock.gametracker.tagdescription;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST endpoints for auto-written category/mechanic descriptions. Mirrors
 * WishlistController's style: thin, delegates to TagDescriptionService.
 */
@RestController
@RequestMapping("/api/tag-descriptions")
@Tag(name = "Tag Descriptions", description = "AI-written explanations of categories/mechanics not in the curated preset list")
public class TagDescriptionController {

    private final TagDescriptionService service;

    public TagDescriptionController(TagDescriptionService service) {
        this.service = service;
    }

    @Operation(summary = "List all auto-written and user-edited tag descriptions")
    @GetMapping
    public List<TagDescription> list() {
        return service.findAll();
    }

    @Operation(summary = "Correct a tag's description")
    // PATCH /api/tag-descriptions/{id} — same rationale as GameController's /series:
    // changing one field, not replacing the whole resource. Marks it user-edited.
    @PatchMapping("/{id}")
    public TagDescription updateDescription(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return service.updateDescription(id, body.get("description"));
    }

    @Operation(summary = "Remove a tag description (e.g. a bad AI guess)")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
