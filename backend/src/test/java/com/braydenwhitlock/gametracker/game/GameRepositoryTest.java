package com.braydenwhitlock.gametracker.game;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class GameRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15");

    @Autowired
    private GameRepository gameRepository;

    @Test
    void persistsAndLoadsGameWithCollections() {
        Game game = new Game();
        game.setTitle("Catan");
        game.setBggId(13);
        game.setMinPlayers(3);
        game.setMaxPlayers(4);
        game.setMinPlayTimeMinutes(60);
        game.setMaxPlayTimeMinutes(120);
        game.setComplexityWeight(2.34);
        game.setCategories(List.of("Strategy", "Economic"));
        game.setMechanics(List.of("Trading", "Dice Rolling"));
        game.setOwnedSince(LocalDate.of(2024, 1, 15));
        game.setPersonalRating(8);
        game.setNotes("Classic gateway game.");

        Game saved = gameRepository.saveAndFlush(game);
        gameRepository.findById(saved.getId()); // sanity

        List<Game> all = gameRepository.findAll();
        assertThat(all).hasSize(1);
        Game loaded = all.get(0);
        assertThat(loaded.getTitle()).isEqualTo("Catan");
        assertThat(loaded.getBggId()).isEqualTo(13);
        assertThat(loaded.getCategories()).containsExactlyInAnyOrder("Strategy", "Economic");
        assertThat(loaded.getMechanics()).containsExactlyInAnyOrder("Trading", "Dice Rolling");
        assertThat(loaded.getPersonalRating()).isEqualTo(8);
    }

    @Test
    void deletesGameAndItsCollections() {
        Game game = new Game();
        game.setTitle("Wingspan");
        game.setMinPlayers(1);
        game.setMaxPlayers(5);
        game.setMinPlayTimeMinutes(40);
        game.setMaxPlayTimeMinutes(70);
        game.setCategories(List.of("Engine Building"));
        game.setMechanics(List.of("Card Drafting"));

        Game saved = gameRepository.saveAndFlush(game);
        gameRepository.deleteById(saved.getId());
        gameRepository.flush();

        assertThat(gameRepository.findAll()).isEmpty();
    }
}
