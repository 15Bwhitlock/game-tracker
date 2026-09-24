package com.braydenwhitlock.gametracker.backup;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(BackupController.class)
class BackupControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean BackupService service;

    @Test
    void exportIsADownloadableJsonFile() throws Exception {
        when(service.export()).thenReturn(new BackupData(1, Instant.parse("2026-01-01T00:00:00Z"), List.of(), List.of(), List.of()));

        mvc.perform(get("/api/backup"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment; filename=\"game-tracker-backup-")))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void restoreReturnsCounts() throws Exception {
        when(service.restore(any())).thenReturn(Map.of("games", 2));

        mvc.perform(post("/api/backup/restore")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":1,\"games\":[],\"wishlist\":[],\"tagDescriptions\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.games").value(2));
    }
}
