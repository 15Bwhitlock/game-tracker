package com.braydenwhitlock.gametracker.game;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;
import java.util.Map;

/**
 * REST endpoints for the game collection.
 *
 * All routes are under /api/games. This class is intentionally thin —
 * it just validates input, delegates to GameService, and shapes the
 * HTTP response. No business logic lives here.
 *
 * Error responses (404, 400, 500) are handled centrally by
 * GlobalExceptionHandler so we don't repeat that logic in every method.
 */
@RestController
@RequestMapping("/api/games")
public class GameController {

    private final GameService gameService;

    public GameController(GameService gameService) {
        this.gameService = gameService;
    }

    // GET /api/games — returns the full collection as a JSON array.
    @GetMapping
    public List<Game> list() {
        return gameService.findAll();
    }

    // GET /api/games/{id} — returns one game, or 404 if it doesn't exist.
    @GetMapping("/{id}")
    public Game get(@PathVariable Long id) {
        return gameService.findById(id);
    }

    // POST /api/games — creates a new game. @Valid triggers the bean validation
    // annotations on Game (e.g. @NotBlank on title) before the method runs.
    // Returns 201 Created with a Location header pointing to the new resource,
    // which is the standard REST convention for POST.
    @PostMapping
    public ResponseEntity<Game> create(@Valid @RequestBody Game game) {
        Game saved = gameService.create(game);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(saved.getId())
                .toUri();
        return ResponseEntity.created(location).body(saved);
    }

    // PUT /api/games/{id} — full replacement of an existing game's fields.
    // Returns the updated game so the UI doesn't need a separate GET.
    @PutMapping("/{id}")
    public Game update(@PathVariable Long id, @Valid @RequestBody Game game) {
        return gameService.update(id, game);
    }

    // PATCH /api/games/{id}/favorite — toggles the favourite flag.
    // PATCH is used instead of PUT because we're changing a single field,
    // not replacing the whole resource. No request body needed.
    // Note: PATCH must be listed in WebConfig's CORS allowedMethods or
    // the browser's preflight OPTIONS check will fail.
    @PatchMapping("/{id}/favorite")
    public Game toggleFavorite(@PathVariable Long id) {
        return gameService.toggleFavorite(id);
    }

    // PATCH /api/games/{id}/series — sets (or clears) the series name for one game.
    // Used when the user accepts a series suggestion for an already-saved game.
    @PatchMapping("/{id}/series")
    public Game updateSeriesName(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return gameService.updateSeriesName(id, body.get("seriesName"));
    }

    // DELETE /api/games/{id} — removes the game and all its plays (cascade).
    // Returns 204 No Content (success, nothing to return) rather than 200.
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        gameService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
