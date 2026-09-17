package com.braydenwhitlock.gametracker.wishlist;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WishlistRepository extends JpaRepository<Wishlist, Long> {
}
