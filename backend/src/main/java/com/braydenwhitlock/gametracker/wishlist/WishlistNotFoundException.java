package com.braydenwhitlock.gametracker.wishlist;

/**
 * Thrown by WishlistService when a wishlist item ID doesn't exist.
 * GlobalExceptionHandler catches this and returns a 404 — same pattern as
 * GameNotFoundException.
 */
public class WishlistNotFoundException extends RuntimeException {

    public WishlistNotFoundException(Long id) {
        super("Wishlist item not found: " + id);
    }
}
