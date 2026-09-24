package com.braydenwhitlock.gametracker.tagdescription;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(TagDescriptionController.class)
class TagDescriptionControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean TagDescriptionService service;

    @Test
    void listReturnsAllTagDescriptions() throws Exception {
        TagDescription tag = sampleTag();
        when(service.findAll()).thenReturn(List.of(tag));

        mvc.perform(get("/api/tag-descriptions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Take That"))
                .andExpect(jsonPath("$[0].type").value("MECHANIC"))
                .andExpect(jsonPath("$[0].source").value("AI"));
    }

    @Test
    void updateDescriptionReturnsTheUpdatedTag() throws Exception {
        TagDescription updated = sampleTag();
        updated.setDescription("Corrected text");
        updated.setSource(TagSource.USER);
        when(service.updateDescription(eq(1L), eq("Corrected text"))).thenReturn(updated);

        mvc.perform(patch("/api/tag-descriptions/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"Corrected text\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description").value("Corrected text"))
                .andExpect(jsonPath("$.source").value("USER"));
    }

    @Test
    void updateDescriptionReturns404WhenNotFound() throws Exception {
        when(service.updateDescription(eq(99L), org.mockito.ArgumentMatchers.any()))
                .thenThrow(new TagDescriptionNotFoundException(99L));

        mvc.perform(patch("/api/tag-descriptions/99")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Tag description not found: 99"));
    }

    @Test
    void overrideUpsertsAndReturnsTheRow() throws Exception {
        TagDescription saved = sampleTag();
        saved.setName("Strategy");
        saved.setType(TagType.CATEGORY);
        saved.setSource(TagSource.USER);
        when(service.upsertOverride("Strategy", TagType.CATEGORY, "My take")).thenReturn(saved);

        mvc.perform(put("/api/tag-descriptions/override")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Strategy\",\"type\":\"CATEGORY\",\"description\":\"My take\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("USER"));
    }

    @Test
    void overrideRejectsABlankDescriptionOrUnknownType() throws Exception {
        mvc.perform(put("/api/tag-descriptions/override")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Strategy\",\"type\":\"CATEGORY\",\"description\":\"  \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/tag-descriptions/override")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Strategy\",\"type\":\"NOPE\",\"description\":\"x\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deleteReturns204() throws Exception {
        doNothing().when(service).delete(1L);

        mvc.perform(delete("/api/tag-descriptions/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteReturns404WhenNotFound() throws Exception {
        doThrow(new TagDescriptionNotFoundException(99L)).when(service).delete(99L);

        mvc.perform(delete("/api/tag-descriptions/99"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Tag description not found: 99"));
    }

    private static TagDescription sampleTag() {
        TagDescription tag = new TagDescription();
        tag.setId(1L);
        tag.setName("Take That");
        tag.setType(TagType.MECHANIC);
        tag.setDescription("Players can directly hinder or damage each other.");
        tag.setSource(TagSource.AI);
        tag.setCreatedAt(Instant.now());
        return tag;
    }
}
