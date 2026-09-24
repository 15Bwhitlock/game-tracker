package com.braydenwhitlock.gametracker.backup;

import com.braydenwhitlock.gametracker.game.Game;
import com.braydenwhitlock.gametracker.tagdescription.TagDescription;
import com.braydenwhitlock.gametracker.wishlist.Wishlist;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Everything the user owns, as one JSON document. Plays are nested under their game
 * rather than referencing its id, since ids are regenerated on restore.
 */
public record BackupData(
        int version,
        Instant exportedAt,
        List<GameEntry> games,
        List<Wishlist> wishlist,
        List<TagDescription> tagDescriptions
) {
    public static final int CURRENT_VERSION = 1;

    public record GameEntry(Game game, List<PlayEntry> plays) {}

    public record PlayEntry(LocalDate playedAt, String notes) {}
}
