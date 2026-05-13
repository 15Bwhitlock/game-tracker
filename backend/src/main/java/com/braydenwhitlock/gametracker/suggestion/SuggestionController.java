package com.braydenwhitlock.gametracker.suggestion;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes {@link SuggestionService}. POST (not GET) because the criteria payload is rich
 * enough — categories/mechanics lists, complexity bounds — that stuffing it into a query
 * string is awkward and the request isn't really cacheable at the HTTP layer anyway
 * (it's tied to the user's mutable collection).
 */
@RestController
@RequestMapping("/api/suggestions")
public class SuggestionController {

    private final SuggestionService suggestionService;

    public SuggestionController(SuggestionService suggestionService) {
        this.suggestionService = suggestionService;
    }

    @PostMapping
    public SuggestionPage suggest(@Valid @RequestBody SuggestionCriteria criteria) {
        return suggestionService.suggest(criteria);
    }
}
