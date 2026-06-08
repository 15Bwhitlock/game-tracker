package com.braydenwhitlock.gametracker.game;

import com.github.dockerjava.api.model.HostConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class GameRepositoryTest {

    @Container
    @ServiceConnection
    // seccomp:unconfined mirrors docker-compose.yml — required on Docker Desktop ≤20.10.
    // Patch the existing HostConfig rather than replacing it so Testcontainers' port bindings survive.
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .waitingFor(Wait.forListeningPort().withStartupTimeout(Duration.ofSeconds(120)))
            .withCreateContainerCmdModifier(cmd -> {
                HostConfig hc = cmd.getHostConfig();
                if (hc == null) hc = new HostConfig();
                cmd.withHostConfig(hc.withSecurityOpts(List.of("seccomp=unconfined")));
            });

    @Autowired
    private GameRepository gameRepository;

    @BeforeEach
    void clearDatabase() {
        gameRepository.deleteAll();
        gameRepository.flush();
    }

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
    void persistsSeriesNameAndFavoriteFlag() {
        Game game = new Game();
        game.setTitle("Cthulhu Fluxx");
        game.setMinPlayers(2);
        game.setMaxPlayers(6);
        game.setMinPlayTimeMinutes(15);
        game.setMaxPlayTimeMinutes(30);
        game.setSeriesName("Fluxx");
        game.setFavorite(true);

        Game saved = gameRepository.saveAndFlush(game);
        gameRepository.findById(saved.getId());

        Game loaded = gameRepository.findAll().get(0);
        assertThat(loaded.getSeriesName()).isEqualTo("Fluxx");
        assertThat(loaded.isFavorite()).isTrue();
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
