package com.braydenwhitlock.gametracker.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/settings")
@Tag(name = "Settings", description = "App-wide settings, e.g. whether AI-generated tag descriptions are enabled")
public class AppSettingsController {

    private final AppSettingsService service;

    public AppSettingsController(AppSettingsService service) {
        this.service = service;
    }

    @Operation(summary = "Get the current app settings")
    @GetMapping
    public AppSettings get() {
        return service.get();
    }

    @Operation(summary = "Turn AI-generated tag descriptions on or off")
    @PatchMapping
    public AppSettings update(@RequestBody Map<String, Boolean> body) {
        return service.updateAiEnabled(body.get("aiEnabled"));
    }
}
