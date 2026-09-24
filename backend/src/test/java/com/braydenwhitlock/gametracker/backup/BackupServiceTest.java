package com.braydenwhitlock.gametracker.backup;

import com.braydenwhitlock.gametracker.game.Game;
import com.braydenwhitlock.gametracker.game.GamePlay;
import com.braydenwhitlock.gametracker.game.GamePlayRepository;
import com.braydenwhitlock.gametracker.game.GameRepository;
import com.braydenwhitlock.gametracker.tagdescription.TagDescription;
import com.braydenwhitlock.gametracker.tagdescription.TagDescriptionRepository;
import com.braydenwhitlock.gametracker.wishlist.Wishlist;
import com.braydenwhitlock.gametracker.wishlist.WishlistRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BackupServiceTest {

    private GameRepository games;
    private GamePlayRepository plays;
    private WishlistRepository wishlist;
    private TagDescriptionRepository tags;
    private BackupService service;

    @BeforeEach
    void setUp() {
        games = Mockito.mock(GameRepository.class);
        plays = Mockito.mock(GamePlayRepository.class);
        wishlist = Mockito.mock(WishlistRepository.class);
        tags = Mockito.mock(TagDescriptionRepository.class);
        service = new BackupService(games, plays, wishlist, tags);
    }

    @Test
    void exportNestsEachGamesPlaysUnderIt() {
        Game game = new Game();
        game.setId(7L);
        when(games.findAll()).thenReturn(List.of(game));
        when(plays.findByGameIdOrderByPlayedAtDesc(7L))
                .thenReturn(List.of(new GamePlay(7L, LocalDate.parse("2026-01-02"), "fun")));

        BackupData data = service.export();

        assertThat(data.version()).isEqualTo(BackupData.CURRENT_VERSION);
        assertThat(data.games()).hasSize(1);
        assertThat(data.games().get(0).plays()).containsExactly(new BackupData.PlayEntry(LocalDate.parse("2026-01-02"), "fun"));
    }

    @Test
    void restoreWipesFirstThenReinsertsWithFreshIdsAndRemapsPlays() {
        Game game = new Game();
        game.setId(999L);
        game.setTitle("Catan");
        when(games.save(any())).thenAnswer(inv -> {
            Game g = inv.getArgument(0);
            g.setId(42L);
            return g;
        });
        Wishlist item = new Wishlist();
        item.setId(5L);
        TagDescription tag = new TagDescription();
        tag.setId(6L);
        tag.setCreatedAt(Instant.now());
        BackupData data = new BackupData(1, Instant.now(),
                List.of(new BackupData.GameEntry(game, List.of(new BackupData.PlayEntry(LocalDate.parse("2026-02-03"), null)))),
                List.of(item), List.of(tag));

        Map<String, Integer> counts = service.restore(data);

        var order = inOrder(plays, games, wishlist, tags);
        order.verify(plays).deleteAllInBatch();
        order.verify(games).deleteAll();
        assertThat(game.getId()).isEqualTo(42L);
        ArgumentCaptor<GamePlay> play = ArgumentCaptor.forClass(GamePlay.class);
        verify(plays).save(play.capture());
        assertThat(play.getValue().getGameId()).isEqualTo(42L);
        assertThat(item.getId()).isNull();
        assertThat(tag.getId()).isNull();
        assertThat(counts).containsEntry("games", 1).containsEntry("plays", 1)
                .containsEntry("wishlist", 1).containsEntry("tagDescriptions", 1);
    }

    @Test
    void restoreRejectsAnUnknownVersionWithoutDeletingAnything() {
        assertThatThrownBy(() -> service.restore(new BackupData(99, Instant.now(), List.of(), List.of(), List.of())))
                .isInstanceOf(ResponseStatusException.class);

        verify(games, never()).deleteAll();
        verify(plays, never()).deleteAllInBatch();
    }
}
