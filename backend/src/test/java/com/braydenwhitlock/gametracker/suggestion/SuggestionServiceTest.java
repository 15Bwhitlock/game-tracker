package com.braydenwhitlock.gametracker.suggestion;

import com.braydenwhitlock.gametracker.game.Game;
import com.braydenwhitlock.gametracker.game.GameRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link SuggestionService}: hard filters, scoring, tie-breaking.
 * No Spring context — straight Mockito on the repository so the focus stays on logic.
 */
class SuggestionServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 5, 7);

    private GameRepository repository;
    private SuggestionService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(GameRepository.class);
        Clock fixedClock = Clock.fixed(TODAY.atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        service = new SuggestionService(repository, fixedClock);
    }

    private void stub(Game... games) {
        when(repository.findAll()).thenReturn(new ArrayList<>(List.of(games)));
    }

    private static SuggestionCriteria forPlayers(int players) {
        return new SuggestionCriteria(players, players, null, null, null, null, null, null, null, null, null, null, 0);
    }

    private List<ScoredGame> suggest(SuggestionCriteria c) {
        return service.suggest(c).items();
    }

    private List<ScoredGame> suggest(int players) {
        return service.suggest(forPlayers(players)).items();
    }

    // -------- hard filters --------

    @Test
    void filtersOutGamesBelowMinPlayers() {
        Game requires3 = game("Heavy", 3, 5, 60, 60, null, null, null);
        stub(requires3);

        assertThat(suggest(2)).isEmpty();
        assertThat(suggest(3)).hasSize(1);
    }

    @Test
    void filtersOutGamesAboveMaxPlayers() {
        Game two = game("Two-player", 2, 2, 30, 30, null, null, null);
        stub(two);

        assertThat(suggest(4)).isEmpty();
        assertThat(suggest(2)).hasSize(1);
    }

    @Test
    void filtersOutGamesExceedingTimeBudget() {
        Game longGame = game("Epic", 2, 4, 90, 180, null, null, null);
        Game shortGame = game("Quickie", 2, 4, 15, 30, null, null, null);
        stub(longGame, shortGame);

        SuggestionCriteria under60 = new SuggestionCriteria(3, 3, null, 60, null, null, null, null, null, null, null, null, 0);
        List<ScoredGame> result = suggest(under60);

        assertThat(result).extracting(sg -> sg.game().getTitle()).containsExactly("Quickie");
    }

    @Test
    void filtersByComplexityRangeAndExcludesGamesWithoutWeight() {
        Game light = game("Light", 2, 4, 30, 30, 1.5, null, null);
        Game medium = game("Medium", 2, 4, 30, 30, 2.5, null, null);
        Game heavy = game("Heavy", 2, 4, 30, 30, 4.5, null, null);
        Game unknown = game("Unrated", 2, 4, 30, 30, null, null, null);
        stub(light, medium, heavy, unknown);

        SuggestionCriteria midRange = new SuggestionCriteria(3, 3, null, null, 2.0, 3.0, null, null, null, null, null, null, 0);
        List<ScoredGame> result = suggest(midRange);

        assertThat(result).extracting(sg -> sg.game().getTitle()).containsExactly("Medium");
    }

    @Test
    void filtersByCategoryWithCaseInsensitiveAnyMatch() {
        Game strategy = game("Strategy A", 2, 4, 30, 30, null, List.of("Strategy", "Economic"), null);
        Game party = game("Party A", 2, 4, 30, 30, null, List.of("Party"), null);
        stub(strategy, party);

        SuggestionCriteria onlyStrategy = new SuggestionCriteria(
                3, 3, null, null, null, null, List.of("strategy"), null, null, null, null, null, 0);

        List<ScoredGame> result = suggest(onlyStrategy);

        assertThat(result).extracting(sg -> sg.game().getTitle()).containsExactly("Strategy A");
    }

    @Test
    void filtersByMechanicAnyMatch() {
        Game deck = game("Deck", 2, 4, 30, 30, null, null, List.of("Deck Building"));
        Game dice = game("Dice", 2, 4, 30, 30, null, null, List.of("Dice Rolling"));
        stub(deck, dice);

        SuggestionCriteria deckOrDraft = new SuggestionCriteria(
                3, 3, null, null, null, null, null, List.of("Deck Building", "Drafting"), null, null, null, null, 0);
        List<ScoredGame> result = suggest(deckOrDraft);

        assertThat(result).extracting(sg -> sg.game().getTitle()).containsExactly("Deck");
    }

    // -------- scoring --------

    @Test
    void varietyBonusScalesWithMonthsSinceLastPlayed() {
        Game neverPlayed = game("Fresh", 2, 4, 30, 30, null, null, null);
        Game playedYesterday = game("Recent", 2, 4, 30, 30, null, null, null);
        playedYesterday.setLastPlayedAt(TODAY.minusDays(1));
        Game playedThreeMonthsAgo = game("Stale", 2, 4, 30, 30, null, null, null);
        playedThreeMonthsAgo.setLastPlayedAt(TODAY.minusMonths(3));
        stub(neverPlayed, playedYesterday, playedThreeMonthsAgo);

        List<ScoredGame> result = suggest(3);

        assertThat(result).extracting(sg -> sg.game().getTitle())
                .containsExactly("Fresh", "Stale", "Recent");
        assertThat(result.get(0).score()).isGreaterThan(result.get(1).score());
        assertThat(result.get(1).score()).isGreaterThan(result.get(2).score());
        assertThat(result.get(0).reasons()).contains("Never played yet");
    }

    @Test
    void varietyBonusCapsAtSixMonths() {
        Game sixMonths = game("Six", 2, 4, 30, 30, null, null, null);
        sixMonths.setLastPlayedAt(TODAY.minusMonths(6));
        Game twoYears = game("Two years", 2, 4, 30, 30, null, null, null);
        twoYears.setLastPlayedAt(TODAY.minusYears(2));
        stub(sixMonths, twoYears);

        List<ScoredGame> result = suggest(3);

        // Both should be at the cap, so tie-breaker (title) decides.
        assertThat(result.get(0).score()).isEqualTo(result.get(1).score());
        assertThat(result).extracting(sg -> sg.game().getTitle())
                .containsExactly("Six", "Two years");
    }

    @Test
    void ratingBonusBoostsHighlyRatedGames() {
        Game highRated = game("Loved", 2, 4, 30, 30, null, null, null);
        highRated.setPersonalRating(10);
        highRated.setLastPlayedAt(TODAY.minusDays(1)); // suppress variety bonus
        Game unrated = game("Meh", 2, 4, 30, 30, null, null, null);
        unrated.setLastPlayedAt(TODAY.minusDays(1));
        stub(highRated, unrated);

        List<ScoredGame> result = suggest(3);

        assertThat(result.get(0).game().getTitle()).isEqualTo("Loved");
        assertThat(result.get(0).reasons()).anyMatch(r -> r.contains("Highly rated"));
    }

    // -------- tie-breaking --------

    @Test
    void tieBreaksByPersonalRatingThenTitle() {
        // Both never-played → both at variety cap. Rating differentiates.
        Game ratedHigh = game("Beta", 2, 4, 30, 30, null, null, null);
        ratedHigh.setPersonalRating(7); // below "highly rated" threshold; no extra reason
        Game ratedLow = game("Alpha", 2, 4, 30, 30, null, null, null);
        ratedLow.setPersonalRating(5);
        Game unrated = game("Charlie", 2, 4, 30, 30, null, null, null);
        stub(ratedHigh, ratedLow, unrated);

        List<ScoredGame> result = suggest(3);
        assertThat(result).extracting(sg -> sg.game().getTitle())
                .containsExactly("Beta", "Alpha", "Charlie");
    }

    @Test
    void tieBreaksByTitleWhenScoresAndRatingsEqual() {
        Game zulu = game("Zulu", 2, 4, 30, 30, null, null, null);
        Game alpha = game("Alpha", 2, 4, 30, 30, null, null, null);
        Game mike = game("mike", 2, 4, 30, 30, null, null, null);
        stub(zulu, alpha, mike);

        List<ScoredGame> result = suggest(3);
        assertThat(result).extracting(sg -> sg.game().getTitle())
                .containsExactly("Alpha", "mike", "Zulu");
    }

    // -------- pagination --------

    @Test
    void paginationReturnsCorrectPageAndTotalCount() {
        List<Game> many = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            many.add(game(String.format("Game %02d", i), 2, 4, 30, 30, null, null, null));
        }
        when(repository.findAll()).thenReturn(many);

        SuggestionPage page0 = service.suggest(forPlayers(3));
        assertThat(page0.items()).hasSize(SuggestionService.PAGE_SIZE);
        assertThat(page0.totalCount()).isEqualTo(25);
        assertThat(page0.page()).isEqualTo(0);

        SuggestionCriteria page1Criteria = new SuggestionCriteria(3, 3, null, null, null, null, null, null, null, null, null, null, 1);
        SuggestionPage page1 = service.suggest(page1Criteria);
        assertThat(page1.items()).hasSize(SuggestionService.PAGE_SIZE);

        SuggestionCriteria page2Criteria = new SuggestionCriteria(3, 3, null, null, null, null, null, null, null, null, null, null, 2);
        SuggestionPage page2 = service.suggest(page2Criteria);
        assertThat(page2.items()).hasSize(5);
    }

    @Test
    void emptyCollectionReturnsEmptyPage() {
        when(repository.findAll()).thenReturn(List.of());
        SuggestionPage result = service.suggest(forPlayers(3));
        assertThat(result.items()).isEmpty();
        assertThat(result.totalCount()).isEqualTo(0);
    }

    // -------- helpers --------

    private static Game game(String title, int minP, int maxP, int minT, int maxT,
                             Double weight, List<String> categories, List<String> mechanics) {
        Game g = new Game();
        g.setTitle(title);
        g.setMinPlayers(minP);
        g.setMaxPlayers(maxP);
        g.setMinPlayTimeMinutes(minT);
        g.setMaxPlayTimeMinutes(maxT);
        g.setComplexityWeight(weight);
        if (categories != null) g.setCategories(new ArrayList<>(categories));
        if (mechanics != null) g.setMechanics(new ArrayList<>(mechanics));
        return g;
    }

}
