package com.braydenwhitlock.gametracker.wishlist;

import com.braydenwhitlock.gametracker.game.Game;
import com.braydenwhitlock.gametracker.game.GameRepository;
import com.braydenwhitlock.gametracker.tagdescription.TagDescriptionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class WishlistServiceTest {

    private WishlistRepository wishlistRepo;
    private GameRepository gameRepo;
    private WishlistService service;

    @BeforeEach
    void setUp() {
        wishlistRepo = Mockito.mock(WishlistRepository.class);
        gameRepo = Mockito.mock(GameRepository.class);
        service = new WishlistService(wishlistRepo, gameRepo, Mockito.mock(TagDescriptionService.class));
    }

    @Test
    void createDefaultsAddedAtToTodayWhenNotSet() {
        Wishlist item = new Wishlist();
        item.setTitle("Gloomhaven");
        when(wishlistRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Wishlist saved = service.create(item);

        assertThat(saved.getAddedAt()).isEqualTo(LocalDate.now());
    }

    @Test
    void createKeepsAnExplicitAddedAt() {
        Wishlist item = new Wishlist();
        item.setTitle("Gloomhaven");
        LocalDate explicit = LocalDate.of(2020, 1, 1);
        item.setAddedAt(explicit);
        when(wishlistRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Wishlist saved = service.create(item);

        assertThat(saved.getAddedAt()).isEqualTo(explicit);
    }

    @Test
    void deleteThrowsWhenItemDoesNotExist() {
        when(wishlistRepo.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> service.delete(99L))
                .isInstanceOf(WishlistNotFoundException.class)
                .hasMessage("Wishlist item not found: 99");
    }

    @Test
    void updateNotesSetsAndSavesTheNote() {
        Wishlist item = new Wishlist();
        item.setId(1L);
        item.setTitle("Gloomhaven");
        when(wishlistRepo.findById(1L)).thenReturn(Optional.of(item));
        when(wishlistRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Wishlist updated = service.updateNotes(1L, "Heard great things");

        assertThat(updated.getNotes()).isEqualTo("Heard great things");
    }

    @Test
    void updateNotesThrowsWhenItemDoesNotExist() {
        when(wishlistRepo.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateNotes(99L, "x"))
                .isInstanceOf(WishlistNotFoundException.class);
    }

    @Test
    void moveToCollectionCopiesFieldsAndDeletesTheWishlistRow() {
        Wishlist item = new Wishlist();
        item.setId(1L);
        item.setBggId(174430);
        item.setTitle("Gloomhaven");
        item.setMinPlayers(1);
        item.setMaxPlayers(4);
        item.setMinPlayTimeMinutes(60);
        item.setMaxPlayTimeMinutes(120);
        item.setComplexityWeight(3.9);
        item.setCategories(List.of("Fantasy"));
        item.setMechanics(List.of("Hand Management"));
        item.setThumbnailUrl("thumb.jpg");
        item.setImageUrl("full.jpg");
        item.setYearPublished(2017);
        item.setNotes("Recommended by a friend");
        item.setBasedOnBggId(13);
        item.setBasedOnGameName("Catan");
        when(wishlistRepo.findById(1L)).thenReturn(Optional.of(item));
        when(gameRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Game saved = service.moveToCollection(1L);

        assertThat(saved.getBggId()).isEqualTo(174430);
        assertThat(saved.getTitle()).isEqualTo("Gloomhaven");
        assertThat(saved.getMinPlayers()).isEqualTo(1);
        assertThat(saved.getMaxPlayers()).isEqualTo(4);
        assertThat(saved.getMinPlayTimeMinutes()).isEqualTo(60);
        assertThat(saved.getMaxPlayTimeMinutes()).isEqualTo(120);
        assertThat(saved.getComplexityWeight()).isEqualTo(3.9);
        assertThat(saved.getCategories()).containsExactly("Fantasy");
        assertThat(saved.getMechanics()).containsExactly("Hand Management");
        assertThat(saved.getNotes()).isEqualTo("Recommended by a friend");
        assertThat(saved.getOwnedSince()).isEqualTo(LocalDate.now());
        assertThat(saved.getBasedOnBggId()).isEqualTo(13);
        assertThat(saved.getBasedOnGameName()).isEqualTo("Catan");
        verify(wishlistRepo).deleteById(1L);
    }

    @Test
    void moveToCollectionDefaultsMissingPlayerCountAndTimeToPlaceholders() {
        // A sparse wishlist entry (e.g. added straight from the hot list before a full
        // lookup) has no player count / play time — Game requires them, so defaults kick in.
        Wishlist item = new Wishlist();
        item.setId(2L);
        item.setTitle("Mystery Game");
        when(wishlistRepo.findById(2L)).thenReturn(Optional.of(item));
        when(gameRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Game saved = service.moveToCollection(2L);

        assertThat(saved.getMinPlayers()).isEqualTo(1);
        assertThat(saved.getMaxPlayers()).isEqualTo(1);
        assertThat(saved.getMinPlayTimeMinutes()).isEqualTo(0);
        assertThat(saved.getMaxPlayTimeMinutes()).isEqualTo(0);
    }

    @Test
    void moveToCollectionThrowsWhenItemDoesNotExist() {
        when(wishlistRepo.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.moveToCollection(99L))
                .isInstanceOf(WishlistNotFoundException.class);
    }
}
