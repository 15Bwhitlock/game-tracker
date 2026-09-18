package com.braydenwhitlock.gametracker.wishlist;

import com.braydenwhitlock.gametracker.game.Game;
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
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(WishlistController.class)
class WishlistControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean WishlistService wishlistService;

    // --- GET /api/wishlist ---

    @Test
    void listReturnsAllWishlistItems() throws Exception {
        Wishlist item = sampleItem();
        item.setId(1L);
        when(wishlistService.findAll()).thenReturn(List.of(item));

        mvc.perform(get("/api/wishlist"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Gloomhaven"))
                .andExpect(jsonPath("$[0].id").value(1));
    }

    @Test
    void listReturnsEmptyArrayWhenNoItems() throws Exception {
        when(wishlistService.findAll()).thenReturn(List.of());

        mvc.perform(get("/api/wishlist"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    // --- POST /api/wishlist ---

    @Test
    void createReturns201WithLocationAndBody() throws Exception {
        Wishlist saved = sampleItem();
        saved.setId(1L);
        when(wishlistService.create(any())).thenReturn(saved);

        mvc.perform(post("/api/wishlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(sampleItem())))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", containsString("/api/wishlist/1")))
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.title").value("Gloomhaven"));
    }

    @Test
    void createReturns400WhenTitleIsBlank() throws Exception {
        Wishlist invalid = sampleItem();
        invalid.setTitle("");

        mvc.perform(post("/api/wishlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest());
    }

    // --- PATCH /api/wishlist/{id}/notes ---

    @Test
    void updateNotesReturnsUpdatedItem() throws Exception {
        Wishlist updated = sampleItem();
        updated.setId(1L);
        updated.setNotes("Heard great things");
        when(wishlistService.updateNotes(1L, "Heard great things")).thenReturn(updated);

        mvc.perform(patch("/api/wishlist/1/notes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"notes\":\"Heard great things\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("Heard great things"));
    }

    @Test
    void updateNotesReturns404WhenNotFound() throws Exception {
        when(wishlistService.updateNotes(99L, "x")).thenThrow(new WishlistNotFoundException(99L));

        mvc.perform(patch("/api/wishlist/99/notes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"notes\":\"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Wishlist item not found: 99"));
    }

    // --- DELETE /api/wishlist/{id} ---

    @Test
    void deleteReturns204() throws Exception {
        doNothing().when(wishlistService).delete(1L);

        mvc.perform(delete("/api/wishlist/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteReturns404WhenNotFound() throws Exception {
        doThrow(new WishlistNotFoundException(99L)).when(wishlistService).delete(99L);

        mvc.perform(delete("/api/wishlist/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Wishlist item not found: 99"));
    }

    // --- POST /api/wishlist/{id}/move-to-collection ---

    @Test
    void moveToCollectionReturnsTheCreatedGame() throws Exception {
        Game game = new Game();
        game.setId(5L);
        game.setTitle("Gloomhaven");
        when(wishlistService.moveToCollection(1L)).thenReturn(game);

        mvc.perform(post("/api/wishlist/1/move-to-collection"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(5))
                .andExpect(jsonPath("$.title").value("Gloomhaven"));
    }

    @Test
    void moveToCollectionReturns404WhenNotFound() throws Exception {
        when(wishlistService.moveToCollection(99L)).thenThrow(new WishlistNotFoundException(99L));

        mvc.perform(post("/api/wishlist/99/move-to-collection"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Wishlist item not found: 99"));
    }

    // --- helper ---

    private static Wishlist sampleItem() {
        Wishlist item = new Wishlist();
        item.setTitle("Gloomhaven");
        item.setBggId(174430);
        return item;
    }
}
