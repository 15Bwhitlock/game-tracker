package com.braydenwhitlock.gametracker.backup;

import com.braydenwhitlock.gametracker.game.Game;
import com.braydenwhitlock.gametracker.game.GamePlay;
import com.braydenwhitlock.gametracker.game.GamePlayRepository;
import com.braydenwhitlock.gametracker.game.GameRepository;
import com.braydenwhitlock.gametracker.tagdescription.TagDescription;
import com.braydenwhitlock.gametracker.tagdescription.TagDescriptionRepository;
import com.braydenwhitlock.gametracker.wishlist.Wishlist;
import com.braydenwhitlock.gametracker.wishlist.WishlistRepository;
import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
@Transactional
public class BackupService {

    private final GameRepository gameRepository;
    private final GamePlayRepository playRepository;
    private final WishlistRepository wishlistRepository;
    private final TagDescriptionRepository tagDescriptionRepository;

    public BackupService(GameRepository gameRepository,
                         GamePlayRepository playRepository,
                         WishlistRepository wishlistRepository,
                         TagDescriptionRepository tagDescriptionRepository) {
        this.gameRepository = gameRepository;
        this.playRepository = playRepository;
        this.wishlistRepository = wishlistRepository;
        this.tagDescriptionRepository = tagDescriptionRepository;
    }

    @Transactional(readOnly = true)
    public BackupData export() {
        List<BackupData.GameEntry> games = gameRepository.findAll().stream()
                .map(g -> new BackupData.GameEntry(g, playRepository.findByGameIdOrderByPlayedAtDesc(g.getId()).stream()
                        .map(p -> new BackupData.PlayEntry(p.getPlayedAt(), p.getNotes()))
                        .toList()))
                .toList();
        return new BackupData(BackupData.CURRENT_VERSION, Instant.now(), games,
                wishlistRepository.findAll(), tagDescriptionRepository.findAll());
    }

    /**
     * Replaces the entire collection, wishlist, play history and dictionary edits with the
     * backup's contents. All-or-nothing: any problem rolls the whole restore back.
     */
    public Map<String, Integer> restore(BackupData data) {
        if (data == null || data.version() != BackupData.CURRENT_VERSION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This isn't a Game Tracker backup file (unsupported version).");
        }
        List<BackupData.GameEntry> games = data.games() == null ? List.of() : data.games();
        List<Wishlist> wishlist = data.wishlist() == null ? List.of() : data.wishlist();
        List<TagDescription> tags = data.tagDescriptions() == null ? List.of() : data.tagDescriptions();

        try {
            playRepository.deleteAllInBatch();
            gameRepository.deleteAll();
            wishlistRepository.deleteAll();
            tagDescriptionRepository.deleteAllInBatch();
            gameRepository.flush();

            int plays = 0;
            for (BackupData.GameEntry entry : games) {
                Game game = entry.game();
                game.setId(null);
                Game saved = gameRepository.save(game);
                for (BackupData.PlayEntry p : entry.plays() == null ? List.<BackupData.PlayEntry>of() : entry.plays()) {
                    playRepository.save(new GamePlay(saved.getId(), p.playedAt(), p.notes()));
                    plays++;
                }
            }
            for (Wishlist item : wishlist) {
                item.setId(null);
                wishlistRepository.save(item);
            }
            for (TagDescription tag : tags) {
                tag.setId(null);
                tagDescriptionRepository.save(tag);
            }
            gameRepository.flush();
            return Map.of("games", games.size(), "plays", plays, "wishlist", wishlist.size(), "tagDescriptions", tags.size());
        } catch (ConstraintViolationException | DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The backup file has invalid data, so nothing was changed.", e);
        }
    }
}
