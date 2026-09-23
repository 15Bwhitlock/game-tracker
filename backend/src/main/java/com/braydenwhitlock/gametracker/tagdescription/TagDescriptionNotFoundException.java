package com.braydenwhitlock.gametracker.tagdescription;

/**
 * Thrown by TagDescriptionService when a tag description ID doesn't exist.
 * GlobalExceptionHandler catches this and returns a 404 — same pattern as
 * GameNotFoundException/WishlistNotFoundException.
 */
public class TagDescriptionNotFoundException extends RuntimeException {

    public TagDescriptionNotFoundException(Long id) {
        super("Tag description not found: " + id);
    }
}
