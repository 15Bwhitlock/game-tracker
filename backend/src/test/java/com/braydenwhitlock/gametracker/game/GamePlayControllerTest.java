package com.braydenwhitlock.gametracker.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(GamePlayController.class)
class GamePlayControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean GameService gameService;
    @MockitoBean GamePlayRepository playRepository;

    // --- POST /api/games/{gameId}/plays ---

    @Test
    void logPlayWithEmptyBodyUsesToday() throws Exception {
        Game g = sampleGame(1L);
        when(gameService.logPlay(eq(1L), any(LocalDate.class)))
                .thenReturn(new LogPlayResponse(g, 42L));

        mvc.perform(post("/api/games/1/plays")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.game.title").value("Catan"))
                .andExpect(jsonPath("$.playId").value(42));
    }

    @Test
    void logPlayWithSpecificDatePassesThatDate() throws Exception {
        LocalDate date = LocalDate.of(2026, 3, 15);
        Game g = sampleGame(1L);
        when(gameService.logPlay(1L, date)).thenReturn(new LogPlayResponse(g, 7L));

        mvc.perform(post("/api/games/1/plays")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("playedAt", "2026-03-15"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playId").value(7));
    }

    @Test
    void logPlayWithNoBodyDefaultsToToday() throws Exception {
        Game g = sampleGame(1L);
        when(gameService.logPlay(eq(1L), any(LocalDate.class)))
                .thenReturn(new LogPlayResponse(g, 10L));

        mvc.perform(post("/api/games/1/plays"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.game.id").value(1));
    }

    // --- DELETE /api/games/{gameId}/plays/{playId} ---

    @Test
    void undoPlayReturnsRevertedGame() throws Exception {
        Game reverted = sampleGame(1L);
        reverted.setLastPlayedAt(null);
        when(gameService.undoPlay(1L, 42L)).thenReturn(reverted);

        mvc.perform(delete("/api/games/1/plays/42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Catan"));
    }

    @Test
    void undoPlayReturns404WhenPlayBelongsToDifferentGame() throws Exception {
        when(gameService.undoPlay(1L, 99L)).thenThrow(new GameNotFoundException(1L));

        mvc.perform(delete("/api/games/1/plays/99"))
                .andExpect(status().isNotFound());
    }

    // --- GET /api/games/{gameId}/plays ---

    @Test
    void getPlaysReturnsHistoryNewestFirst() throws Exception {
        Game g = sampleGame(1L);
        when(gameService.findById(1L)).thenReturn(g);

        GamePlay p1 = new GamePlay(1L, LocalDate.of(2026, 5, 1));
        ReflectionTestUtils.setField(p1, "id", 2L);
        GamePlay p2 = new GamePlay(1L, LocalDate.of(2026, 3, 10));
        ReflectionTestUtils.setField(p2, "id", 1L);
        when(playRepository.findByGameIdOrderByPlayedAtDesc(1L)).thenReturn(List.of(p1, p2));

        mvc.perform(get("/api/games/1/plays"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].playedAt").value("2026-05-01"))
                .andExpect(jsonPath("$[1].playedAt").value("2026-03-10"));
    }

    @Test
    void getPlaysReturns404ForUnknownGame() throws Exception {
        when(gameService.findById(99L)).thenThrow(new GameNotFoundException(99L));

        mvc.perform(get("/api/games/99/plays"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: 99"));
    }

    @Test
    void getPlaysReturnsEmptyListWhenNeverPlayed() throws Exception {
        when(gameService.findById(1L)).thenReturn(sampleGame(1L));
        when(playRepository.findByGameIdOrderByPlayedAtDesc(1L)).thenReturn(List.of());

        mvc.perform(get("/api/games/1/plays"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    // --- helper ---

    private static Game sampleGame(Long id) {
        Game g = new Game();
        g.setId(id);
        g.setTitle("Catan");
        g.setMinPlayers(2);
        g.setMaxPlayers(4);
        g.setMinPlayTimeMinutes(60);
        g.setMaxPlayTimeMinutes(120);
        return g;
    }
}
