package com.braydenwhitlock.gametracker.bgg;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Thin proxy in front of {@link BggClient}. Lives separately from {@code GameController}
 * because BGG metadata is upstream context, not part of the user's collection.
 */
@RestController
@RequestMapping("/api/bgg")
public class BggController {

    private final BggClient bggClient;

    public BggController(BggClient bggClient) {
        this.bggClient = bggClient;
    }

    /**
     * Returns lightweight search hits (id + name + year). Empty list for blank queries.
     * The frontend uses this to power the add-game autocomplete; full lookup happens via
     * {@link #details(int)} once the user picks a hit.
     */
    @GetMapping("/search")
    public List<BggSearchHit> search(@RequestParam("q") String query) {
        return bggClient.search(query);
    }

    /**
     * Returns full BGG metadata for a numeric id, or 404 if BGG has no such item.
     */
    @GetMapping("/{bggId}")
    public ResponseEntity<BggGameDetails> details(@PathVariable int bggId) {
        return bggClient.getDetails(bggId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
