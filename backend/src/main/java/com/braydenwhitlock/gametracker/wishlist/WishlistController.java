package com.braydenwhitlock.gametracker.wishlist;

import com.braydenwhitlock.gametracker.game.Game;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;
import java.util.Map;

/**
 * REST endpoints for the wishlist — games the user doesn't own yet. Mirrors
 * GameController's style: thin, delegates to WishlistService.
 */
@RestController
@RequestMapping("/api/wishlist")
@Tag(name = "Wishlist", description = "Games not yet owned, kept for future reference")
public class WishlistController {

    private final WishlistService wishlistService;

    public WishlistController(WishlistService wishlistService) {
        this.wishlistService = wishlistService;
    }

    @Operation(summary = "List the wishlist")
    @GetMapping
    public List<Wishlist> list() {
        return wishlistService.findAll();
    }

    @Operation(summary = "Add a game to the wishlist")
    @PostMapping
    public ResponseEntity<Wishlist> create(@Valid @RequestBody Wishlist item) {
        Wishlist saved = wishlistService.create(item);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    @Operation(summary = "Set or clear a wishlist item's personal note")
    // PATCH /api/wishlist/{id}/notes — same rationale as GameController's
    // /{id}/series: changing one field, not replacing the whole resource.
    @PatchMapping("/{id}/notes")
    public Wishlist updateNotes(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return wishlistService.updateNotes(id, body.get("notes"));
    }

    @Operation(summary = "Remove a game from the wishlist")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        wishlistService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Move a wishlist item into the owned collection")
    // POST /api/wishlist/{id}/move-to-collection — copies the wishlist entry's fields
    // into a new Game, removes it from the wishlist, and returns the created Game.
    @PostMapping("/{id}/move-to-collection")
    public Game moveToCollection(@PathVariable Long id) {
        return wishlistService.moveToCollection(id);
    }
}
