package com.braydenwhitlock.gametracker.suggestion;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Suggestions", description = "Scored recommendations from the owned collection")
public class SuggestionController {

    private final SuggestionService suggestionService;

    public SuggestionController(SuggestionService suggestionService) {
        this.suggestionService = suggestionService;
    }

    @Operation(summary = "Get a page of scored suggestions matching the given criteria",
            description = "minComplexity/maxComplexity must fall within 1.0–5.0 (BGG's weight scale, "
                    + "mapped internally to 5 bands) — out-of-range values return 400, not a scoring result.")
    @ApiResponse(responseCode = "200", description = "Scored, paginated results")
    @ApiResponse(responseCode = "400", description = "Invalid criteria (e.g. minPlayers missing, "
            + "complexity out of 1–5 range)", content = @Content)
    @PostMapping
    public SuggestionPage suggest(@Valid @RequestBody SuggestionCriteria criteria) {
        return suggestionService.suggest(criteria);
    }
}
