package com.braydenwhitlock.gametracker.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(GameController.class)
class GameControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean GameService gameService;

    // --- GET /api/games ---

    @Test
    void listReturnsAllGames() throws Exception {
        Game g = sampleGame();
        g.setId(1L);
        when(gameService.findAll()).thenReturn(List.of(g));

        mvc.perform(get("/api/games"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Catan"))
                .andExpect(jsonPath("$[0].id").value(1));
    }

    @Test
    void listReturnsEmptyArrayWhenNoGames() throws Exception {
        when(gameService.findAll()).thenReturn(List.of());

        mvc.perform(get("/api/games"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    // --- GET /api/games/{id} ---

    @Test
    void getByIdReturnsGame() throws Exception {
        Game g = sampleGame();
        g.setId(1L);
        when(gameService.findById(1L)).thenReturn(g);

        mvc.perform(get("/api/games/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Catan"))
                .andExpect(jsonPath("$.minPlayers").value(2));
    }

    @Test
    void getByIdReturns404WhenNotFound() throws Exception {
        when(gameService.findById(99L)).thenThrow(new GameNotFoundException(99L));

        mvc.perform(get("/api/games/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: 99"));
    }

    // --- POST /api/games ---

    @Test
    void createReturns201WithLocationAndBody() throws Exception {
        Game g = sampleGame();
        Game saved = sampleGame();
        saved.setId(1L);
        when(gameService.create(any())).thenReturn(saved);

        mvc.perform(post("/api/games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(g)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", containsString("/api/games/1")))
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.title").value("Catan"));
    }

    @Test
    void createReturns400WhenTitleIsBlank() throws Exception {
        Game invalid = sampleGame();
        invalid.setTitle("");

        mvc.perform(post("/api/games")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest());
    }

    // --- PUT /api/games/{id} ---

    @Test
    void updateReturnsUpdatedGame() throws Exception {
        Game g = sampleGame();
        g.setId(1L);
        g.setTitle("Updated");
        when(gameService.update(eq(1L), any())).thenReturn(g);

        mvc.perform(put("/api/games/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(g)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Updated"));
    }

    @Test
    void updateReturns404WhenNotFound() throws Exception {
        when(gameService.update(eq(99L), any())).thenThrow(new GameNotFoundException(99L));

        mvc.perform(put("/api/games/99")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(sampleGame())))
                .andExpect(status().isNotFound());
    }

    // --- DELETE /api/games/{id} ---

    @Test
    void deleteReturns204() throws Exception {
        doNothing().when(gameService).delete(1L);

        mvc.perform(delete("/api/games/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteReturns404WhenNotFound() throws Exception {
        doThrow(new GameNotFoundException(99L)).when(gameService).delete(99L);

        mvc.perform(delete("/api/games/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Game not found: 99"));
    }

    // --- PATCH /api/games/{id}/favorite ---

    @Test
    void toggleFavoriteReturnsGameWithFlippedFlag() throws Exception {
        Game g = sampleGame();
        g.setId(1L);
        g.setFavorite(true);
        when(gameService.toggleFavorite(1L)).thenReturn(g);

        mvc.perform(patch("/api/games/1/favorite"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.favorite").value(true));
    }

    // --- helper ---

    private static Game sampleGame() {
        Game g = new Game();
        g.setTitle("Catan");
        g.setMinPlayers(2);
        g.setMaxPlayers(4);
        g.setMinPlayTimeMinutes(60);
        g.setMaxPlayTimeMinutes(120);
        return g;
    }
}
