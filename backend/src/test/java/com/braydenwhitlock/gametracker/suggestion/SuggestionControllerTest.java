package com.braydenwhitlock.gametracker.suggestion;

import com.braydenwhitlock.gametracker.game.Game;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SuggestionController.class)
class SuggestionControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean SuggestionService suggestionService;

    @Test
    void suggestReturnsScoredResults() throws Exception {
        Game g = new Game();
        g.setId(1L);
        g.setTitle("Catan");
        g.setMinPlayers(2);
        g.setMaxPlayers(4);
        g.setMinPlayTimeMinutes(60);
        g.setMaxPlayTimeMinutes(120);

        ScoredGame sg = new ScoredGame(g, 7.5, List.of("Never played yet"));
        SuggestionPage page = new SuggestionPage(List.of(sg), 0, 10, 1);
        when(suggestionService.suggest(any())).thenReturn(page);

        mvc.perform(post("/api/suggestions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("minPlayers", 4))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].game.title").value("Catan"))
                .andExpect(jsonPath("$.items[0].score").value(7.5))
                .andExpect(jsonPath("$.items[0].reasons[0]").value("Never played yet"))
                .andExpect(jsonPath("$.totalCount").value(1));
    }

    @Test
    void suggestReturnsEmptyPageWhenNoMatches() throws Exception {
        SuggestionPage empty = new SuggestionPage(List.of(), 0, 10, 0);
        when(suggestionService.suggest(any())).thenReturn(empty);

        mvc.perform(post("/api/suggestions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("minPlayers", 2))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.totalCount").value(0));
    }

    @Test
    void suggestReturns400WhenMinPlayersIsMissing() throws Exception {
        mvc.perform(post("/api/suggestions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void suggestReturns400WhenMinPlayersIsZero() throws Exception {
        mvc.perform(post("/api/suggestions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("minPlayers", 0))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void suggestPassesPaginationCriteriaThrough() throws Exception {
        SuggestionPage page1 = new SuggestionPage(List.of(), 1, 10, 25);
        when(suggestionService.suggest(any())).thenReturn(page1);

        mvc.perform(post("/api/suggestions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("minPlayers", 3, "page", 1))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.totalCount").value(25));
    }
}
