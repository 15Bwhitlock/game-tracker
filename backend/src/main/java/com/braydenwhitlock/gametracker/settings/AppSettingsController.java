package com.braydenwhitlock.gametracker.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/settings")
@Tag(name = "Settings", description = "App-wide settings, e.g. when the Dictionary was last viewed")
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

    @Operation(summary = "Mark the Dictionary page as viewed just now, resetting which entries count as \"New\"")
    @PostMapping("/dictionary-viewed")
    public AppSettings markDictionaryViewed() {
        return service.markDictionaryViewed();
    }
}
