package com.braydenwhitlock.gametracker.wishlist;

import com.braydenwhitlock.gametracker.game.Game;
import com.braydenwhitlock.gametracker.game.GameRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * Business logic for the wishlist — games the user doesn't own yet, kept for
 * future reference. Deliberately simple: no play-tracking, no suggestion scoring.
 */
@Service
@Transactional
public class WishlistService {

    private final WishlistRepository wishlistRepository;
    private final GameRepository gameRepository;

    public WishlistService(WishlistRepository wishlistRepository, GameRepository gameRepository) {
        this.wishlistRepository = wishlistRepository;
        this.gameRepository = gameRepository;
    }

    @Transactional(readOnly = true)
    public List<Wishlist> findAll() {
        return wishlistRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Wishlist findById(Long id) {
        return wishlistRepository.findById(id).orElseThrow(() -> new WishlistNotFoundException(id));
    }

    public Wishlist create(Wishlist item) {
        item.setId(null);
        if (item.getAddedAt() == null) {
            item.setAddedAt(LocalDate.now());
        }
        return wishlistRepository.save(item);
    }

    public Wishlist updateNotes(Long id, String notes) {
        Wishlist item = findById(id);
        item.setNotes(notes);
        return wishlistRepository.save(item);
    }

    public void delete(Long id) {
        if (!wishlistRepository.existsById(id)) {
            throw new WishlistNotFoundException(id);
        }
        wishlistRepository.deleteById(id);
    }

    /**
     * Converts a wishlist entry into an owned Game — copies every shared field, then
     * removes the wishlist row so the item doesn't linger in both places. Player
     * count / play time default to 1 / 0 when the wishlist entry never had them
     * filled in (they're required on Game but not on Wishlist), since that's a more
     * honest "unknown" placeholder than fabricating a range.
     */
    public Game moveToCollection(Long id) {
        Wishlist item = findById(id);

        Game game = new Game();
        game.setBggId(item.getBggId());
        game.setTitle(item.getTitle());
        game.setMinPlayers(item.getMinPlayers() != null ? item.getMinPlayers() : 1);
        game.setMaxPlayers(item.getMaxPlayers() != null ? item.getMaxPlayers() : 1);
        game.setMinPlayTimeMinutes(item.getMinPlayTimeMinutes() != null ? item.getMinPlayTimeMinutes() : 0);
        game.setMaxPlayTimeMinutes(item.getMaxPlayTimeMinutes() != null ? item.getMaxPlayTimeMinutes() : 0);
        game.setComplexityWeight(item.getComplexityWeight());
        game.setCategories(item.getCategories());
        game.setMechanics(item.getMechanics());
        game.setThumbnailUrl(item.getThumbnailUrl());
        game.setImageUrl(item.getImageUrl());
        game.setYearPublished(item.getYearPublished());
        game.setNotes(item.getNotes());
        game.setOwnedSince(LocalDate.now());
        game.setBasedOnBggId(item.getBasedOnBggId());
        game.setBasedOnGameName(item.getBasedOnGameName());

        Game saved = gameRepository.save(game);
        wishlistRepository.deleteById(id);
        return saved;
    }
}
