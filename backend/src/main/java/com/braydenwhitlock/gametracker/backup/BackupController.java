package com.braydenwhitlock.gametracker.backup;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/backup")
@Tag(name = "Backup", description = "Export or restore the whole collection as one JSON file")
public class BackupController {

    private final BackupService service;

    public BackupController(BackupService service) {
        this.service = service;
    }

    @Operation(summary = "Download everything (games, plays, wishlist, dictionary edits) as JSON")
    @GetMapping
    public ResponseEntity<BackupData> export() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"game-tracker-backup-" + LocalDate.now() + ".json\"")
                .body(service.export());
    }

    @Operation(summary = "Replace everything with the contents of a backup file")
    @PostMapping("/restore")
    public Map<String, Integer> restore(@RequestBody BackupData data) {
        return service.restore(data);
    }
}
