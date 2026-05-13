package com.braydenwhitlock.gametracker.suggestion;

import java.util.List;

/**
 * Paginated result from {@link SuggestionService#suggest}.
 *
 * @param items      games on this page, scored and sorted
 * @param page       0-based index of this page
 * @param pageSize   number of items per page (fixed at {@link SuggestionService#PAGE_SIZE})
 * @param totalCount total games that matched the criteria across all pages
 */
public record SuggestionPage(
        List<ScoredGame> items,
        int page,
        int pageSize,
        int totalCount) {

    public boolean hasMore() {
        return (long) (page + 1) * pageSize < totalCount;
    }
}
