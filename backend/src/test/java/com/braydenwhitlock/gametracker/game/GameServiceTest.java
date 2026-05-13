package com.braydenwhitlock.gametracker.game;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class GameServiceTest {

    private GameRepository gameRepo;
    private GamePlayRepository playRepo;
    private EntityManager em;
    private GameService service;

    @BeforeEach
    void setUp() {
        gameRepo = Mockito.mock(GameRepository.class);
        playRepo = Mockito.mock(GamePlayRepository.class);
        em = Mockito.mock(EntityManager.class);
        service = new GameService(gameRepo, playRepo, em);
    }

    // --- findById ---

    @Test
    void findByIdReturnsGame() {
        Game g = game("Chess");
        when(gameRepo.findById(1L)).thenReturn(Optional.of(g));
        assertThat(service.findById(1L).getTitle()).isEqualTo("Chess");
    }

    @Test
    void findByIdThrowsWhenNotFound() {
        when(gameRepo.findById(99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.findById(99L))
                .isInstanceOf(GameNotFoundException.class)
                .hasMessageContaining("99");
    }

    // --- create ---

    @Test
    void createClearsIdBeforeSave() {
        Game g = game("Catan");
        g.setId(99L); // client-supplied ID — must be cleared
        Game saved = game("Catan");
        saved.setId(1L);
        when(gameRepo.save(any())).thenReturn(saved);

        Game result = service.create(g);

        verify(gameRepo).save(argThat(arg -> arg.getId() == null));
        assertThat(result.getId()).isEqualTo(1L);
    }

    // --- update ---

    @Test
    void updateOverwritesAllEditableFields() {
        Game existing = game("Old Title");
        existing.setId(1L);
        when(gameRepo.findById(1L)).thenReturn(Optional.of(existing));

        Game updates = game("New Title");
        updates.setPersonalRating(9);
        updates.setNotes("Great game");
        updates.setMinPlayers(3);
        updates.setMaxPlayers(6);

        Game result = service.update(1L, updates);

        assertThat(result.getTitle()).isEqualTo("New Title");
        assertThat(result.getPersonalRating()).isEqualTo(9);
        assertThat(result.getNotes()).isEqualTo("Great game");
        assertThat(result.getMinPlayers()).isEqualTo(3);
        assertThat(result.getMaxPlayers()).isEqualTo(6);
    }

    @Test
    void updateThrowsWhenGameNotFound() {
        when(gameRepo.findById(99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.update(99L, game("X")))
                .isInstanceOf(GameNotFoundException.class);
    }

    // --- delete ---

    @Test
    void deleteRemovesGame() {
        when(gameRepo.existsById(1L)).thenReturn(true);
        service.delete(1L);
        verify(gameRepo).deleteById(1L);
    }

    @Test
    void deleteThrowsWhenNotFound() {
        when(gameRepo.existsById(99L)).thenReturn(false);
        assertThatThrownBy(() -> service.delete(99L))
                .isInstanceOf(GameNotFoundException.class);
    }

    // --- toggleFavorite ---

    @Test
    void toggleFavoriteFlipsFalseToTrue() {
        Game g = game("Pandemic");
        g.setId(1L);
        g.setFavorite(false);
        when(gameRepo.findById(1L)).thenReturn(Optional.of(g));
        when(gameRepo.save(g)).thenReturn(g);

        Game result = service.toggleFavorite(1L);

        assertThat(result.isFavorite()).isTrue();
    }

    @Test
    void toggleFavoriteFlipsTrueToFalse() {
        Game g = game("Pandemic");
        g.setId(1L);
        g.setFavorite(true);
        when(gameRepo.findById(1L)).thenReturn(Optional.of(g));
        when(gameRepo.save(g)).thenReturn(g);

        Game result = service.toggleFavorite(1L);

        assertThat(result.isFavorite()).isFalse();
    }

    // --- logPlay ---

    @Test
    void logPlaySavesPlayAndSetsLastPlayedAt() {
        Game g = game("Wingspan");
        g.setId(1L);
        when(gameRepo.findById(1L)).thenReturn(Optional.of(g));
        when(playRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        LocalDate date = LocalDate.of(2026, 5, 1);
        service.logPlay(1L, date);

        verify(playRepo).save(argThat(p -> p.getGameId().equals(1L) && p.getPlayedAt().equals(date)));
        verify(em).flush();
        verify(em).refresh(g);
        assertThat(g.getLastPlayedAt()).isEqualTo(date);
    }

    @Test
    void logPlayUpdatesLastPlayedAtOnlyWhenDateIsLater() {
        Game g = game("Wingspan");
        g.setId(1L);
        g.setLastPlayedAt(LocalDate.of(2026, 5, 10));
        when(gameRepo.findById(1L)).thenReturn(Optional.of(g));
        when(playRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.logPlay(1L, LocalDate.of(2026, 3, 1)); // earlier than existing

        assertThat(g.getLastPlayedAt()).isEqualTo(LocalDate.of(2026, 5, 10));
    }

    @Test
    void logPlaySetsLastPlayedAtWhenPreviouslyNull() {
        Game g = game("Wingspan");
        g.setId(1L);
        // lastPlayedAt starts null
        when(gameRepo.findById(1L)).thenReturn(Optional.of(g));
        when(playRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        LocalDate date = LocalDate.of(2026, 1, 15);
        service.logPlay(1L, date);

        assertThat(g.getLastPlayedAt()).isEqualTo(date);
    }

    // --- undoPlay ---

    @Test
    void undoPlayDeletesPlayAndRecalculatesLastPlayedAt() {
        Game g = game("Catan");
        g.setId(1L);
        GamePlay play = new GamePlay(1L, LocalDate.of(2026, 5, 1));
        ReflectionTestUtils.setField(play, "id", 42L);

        GamePlay remaining = new GamePlay(1L, LocalDate.of(2026, 3, 10));
        ReflectionTestUtils.setField(remaining, "id", 41L);

        when(playRepo.findById(42L)).thenReturn(Optional.of(play));
        when(gameRepo.findById(1L)).thenReturn(Optional.of(g));
        when(playRepo.findByGameIdOrderByPlayedAtDesc(1L)).thenReturn(List.of(remaining));

        service.undoPlay(1L, 42L);

        verify(playRepo).delete(play);
        verify(em).flush();
        verify(em).refresh(g);
        assertThat(g.getLastPlayedAt()).isEqualTo(LocalDate.of(2026, 3, 10));
    }

    @Test
    void undoPlaySetsLastPlayedAtToNullWhenNoPlaysRemain() {
        Game g = game("Catan");
        g.setId(1L);
        g.setLastPlayedAt(LocalDate.of(2026, 5, 1));
        GamePlay play = new GamePlay(1L, LocalDate.of(2026, 5, 1));
        ReflectionTestUtils.setField(play, "id", 42L);

        when(playRepo.findById(42L)).thenReturn(Optional.of(play));
        when(gameRepo.findById(1L)).thenReturn(Optional.of(g));
        when(playRepo.findByGameIdOrderByPlayedAtDesc(1L)).thenReturn(List.of());

        service.undoPlay(1L, 42L);

        assertThat(g.getLastPlayedAt()).isNull();
    }

    @Test
    void undoPlayThrowsWhenPlayBelongsToDifferentGame() {
        // play.gameId = 2, but we ask to undo for game 1
        GamePlay wrongPlay = new GamePlay(2L, LocalDate.of(2026, 5, 1));
        ReflectionTestUtils.setField(wrongPlay, "id", 99L);
        when(playRepo.findById(99L)).thenReturn(Optional.of(wrongPlay));

        assertThatThrownBy(() -> service.undoPlay(1L, 99L))
                .isInstanceOf(GameNotFoundException.class);
    }

    // --- helper ---

    private static Game game(String title) {
        Game g = new Game();
        g.setTitle(title);
        g.setMinPlayers(2);
        g.setMaxPlayers(4);
        g.setMinPlayTimeMinutes(60);
        g.setMaxPlayTimeMinutes(120);
        return g;
    }
}
