package com.braydenwhitlock.gametracker.suggestion;

import com.braydenwhitlock.gametracker.game.Game;
import com.braydenwhitlock.gametracker.game.GameRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Suggests games from the user's collection that fit a set of criteria.
 *
 * <p>Two-phase: hard filters drop games that can't physically be played (wrong player count,
 * exceeds time budget, complexity/category/mechanic mismatch); then a score is computed on
 * the survivors so the top-N feel intentional rather than alphabetical.
 *
 * <p>Scoring weights are picked to be small and additive — easy to reason about, easy to
 * tweak. Best-player-count fit will be added once a {@code bestPlayerCount} field lands on
 * {@code Game} (sourced from BGG's poll data).
 */
@Service
@Transactional(readOnly = true)
public class SuggestionService {

    /** Number of suggestions per page. */
    static final int PAGE_SIZE = 10;

    /** Variety: 1 point per full month since {@code lastPlayedAt}, capped so it can't dominate. */
    static final double VARIETY_POINTS_PER_MONTH = 1.0;
    static final int VARIETY_CAP_MONTHS = 6;
    /** Never-played games are treated as maximally fresh (full variety bonus). */
    static final double UNPLAYED_VARIETY_POINTS = VARIETY_CAP_MONTHS * VARIETY_POINTS_PER_MONTH;

    /** Rating: personalRating / 2 → range [0.5, 5.0]. Null rating contributes 0. */
    static final double RATING_DIVISOR = 2.0;

    // BGG weight ranges for each integer complexity level (1–5).
    private static final double[] COMPLEXITY_LOWER = { 0, 1.0, 1.7, 2.5, 3.3, 4.0 };
    private static final double[] COMPLEXITY_UPPER = { 0, 1.7, 2.5, 3.3, 4.0, 5.0 };

    private final GameRepository gameRepository;
    private final Clock clock;

    public SuggestionService(GameRepository gameRepository, Clock clock) {
        this.gameRepository = gameRepository;
        this.clock = clock;
    }

    /**
     * Returns suggestions matching {@code criteria}, scored highest first. Results are
     * paged at {@link #PAGE_SIZE} entries per page. Empty list when nothing fits — that's a valid
     * answer ("nothing in your collection works for this session").
     */
    public SuggestionPage suggest(SuggestionCriteria criteria) {
        LocalDate today = LocalDate.now(clock);
        int page = criteria.page() != null ? criteria.page() : 0;

        List<ScoredGame> all = gameRepository.findAll().stream()
                .filter(game -> passesHardFilters(game, criteria))
                .map(game -> score(game, today))
                .sorted(byScoreThenRatingThenTitle())
                .toList();

        int from = page * PAGE_SIZE;
        List<ScoredGame> items = from >= all.size()
                ? List.of()
                : all.subList(from, Math.min(from + PAGE_SIZE, all.size()));

        return new SuggestionPage(items, page, PAGE_SIZE, all.size());
    }

    private static boolean passesHardFilters(Game game, SuggestionCriteria c) {
        int reqMin = c.minPlayers();
        int reqMax = c.maxPlayers() != null ? c.maxPlayers() : reqMin;
        // requested range must overlap the game's supported player count range
        if (reqMax < game.getMinPlayers() || reqMin > game.getMaxPlayers()) {
            return false;
        }
        if (c.minMinutes() != null && game.getMinPlayTimeMinutes() < c.minMinutes()) {
            return false;
        }
        if (c.maxMinutes() != null && game.getMaxPlayTimeMinutes() > c.maxMinutes()) {
            return false;
        }
        Double weight = game.getComplexityWeight();
        if (c.minComplexity() != null && (weight == null || weight < COMPLEXITY_LOWER[c.minComplexity().intValue()])) {
            return false;
        }
        if (c.maxComplexity() != null && (weight == null || weight > COMPLEXITY_UPPER[c.maxComplexity().intValue()])) {
            return false;
        }
        if (notEmpty(c.categories()) && !anyMatchIgnoreCase(game.getCategories(), c.categories())) {
            return false;
        }
        if (notEmpty(c.mechanics()) && !anyMatchIgnoreCase(game.getMechanics(), c.mechanics())) {
            return false;
        }
        if (notEmpty(c.series()) && !seriesMatchesIgnoreCase(game.getSeriesName(), c.series())) {
            return false;
        }
        if (Boolean.TRUE.equals(c.favoritesOnly()) && !game.isFavorite()) {
            return false;
        }
        if (Boolean.TRUE.equals(c.unplayedOnly()) && (game.getPlayCount() > 0 || game.getLastPlayedAt() != null)) {
            return false;
        }
        if (c.maxPlayCount() != null && game.getPlayCount() > c.maxPlayCount()) {
            return false;
        }
        if (c.minRating() != null && (game.getPersonalRating() == null || game.getPersonalRating() < c.minRating())) {
            return false;
        }
        return true;
    }

    private static ScoredGame score(Game game, LocalDate today) {
        double score = 0.0;
        List<String> reasons = new ArrayList<>();

        double varietyBonus = varietyBonus(game.getLastPlayedAt(), today);
        if (varietyBonus > 0) {
            score += varietyBonus;
            reasons.add(varietyReason(game.getLastPlayedAt(), today));
        }

        if (game.getPersonalRating() != null) {
            double ratingBonus = game.getPersonalRating() / RATING_DIVISOR;
            score += ratingBonus;
            if (game.getPersonalRating() >= 8) {
                reasons.add("Highly rated (" + game.getPersonalRating() + "/10)");
            }
        }

        return new ScoredGame(game, score, reasons);
    }

    private static double varietyBonus(LocalDate lastPlayed, LocalDate today) {
        if (lastPlayed == null) {
            return UNPLAYED_VARIETY_POINTS;
        }
        long months = ChronoUnit.MONTHS.between(lastPlayed, today);
        if (months <= 0) {
            return 0.0;
        }
        return Math.min(months, VARIETY_CAP_MONTHS) * VARIETY_POINTS_PER_MONTH;
    }

    private static String varietyReason(LocalDate lastPlayed, LocalDate today) {
        if (lastPlayed == null) {
            return "Never played yet";
        }
        long months = ChronoUnit.MONTHS.between(lastPlayed, today);
        if (months >= VARIETY_CAP_MONTHS) {
            return "Haven't played in " + VARIETY_CAP_MONTHS + "+ months";
        }
        return "Haven't played in " + months + (months == 1 ? " month" : " months");
    }

    /**
     * Sort key: highest score wins; then highest personalRating (treating null as 0) so a
     * proven favourite beats a never-played game at the same variety-derived score; then
     * title for stable, predictable ordering when everything else ties.
     */
    private static Comparator<ScoredGame> byScoreThenRatingThenTitle() {
        return Comparator.comparingDouble(ScoredGame::score).reversed()
                .thenComparing((ScoredGame sg) -> sg.game().getPersonalRating() == null ? 0 : sg.game().getPersonalRating(),
                        Comparator.reverseOrder())
                .thenComparing(sg -> sg.game().getTitle() == null ? "" : sg.game().getTitle(),
                        String.CASE_INSENSITIVE_ORDER);
    }

    private static boolean notEmpty(List<String> list) {
        return list != null && !list.isEmpty();
    }

    private static boolean seriesMatchesIgnoreCase(String seriesName, List<String> needles) {
        if (seriesName == null) return false;
        String lower = seriesName.toLowerCase(Locale.ROOT);
        for (String needle : needles) {
            if (needle != null && lower.equals(needle.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private static boolean anyMatchIgnoreCase(List<String> haystack, List<String> needles) {
        if (haystack == null || haystack.isEmpty()) {
            return false;
        }
        Set<String> lowered = new HashSet<>();
        for (String s : haystack) {
            if (s != null) lowered.add(s.toLowerCase(Locale.ROOT));
        }
        for (String needle : needles) {
            if (needle != null && lowered.contains(needle.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }
}
