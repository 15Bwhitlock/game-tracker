package com.braydenwhitlock.gametracker.settings;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AppSettingsController.class)
class AppSettingsControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean AppSettingsService service;

    @Test
    void getReturnsTheCurrentSettings() throws Exception {
        AppSettings settings = new AppSettings();
        settings.setId(1L);
        settings.setAiEnabled(true);
        when(service.get()).thenReturn(settings);

        mvc.perform(get("/api/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aiEnabled").value(true));
    }

    @Test
    void patchTogglesAiEnabled() throws Exception {
        AppSettings updated = new AppSettings();
        updated.setId(1L);
        updated.setAiEnabled(false);
        when(service.updateAiEnabled(false)).thenReturn(updated);

        mvc.perform(patch("/api/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"aiEnabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aiEnabled").value(false));
    }
}
