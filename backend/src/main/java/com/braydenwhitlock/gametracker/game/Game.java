package com.braydenwhitlock.gametracker.game;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.validation.constraints.DecimalMax;
import org.hibernate.annotations.Formula;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * A single board game in the user's collection.
 *
 * Categories and mechanics are stored in child tables ("game_categories", "game_mechanics")
 * rather than a JSON column so they can be filtered/indexed individually.
 *
 * {@code playCount} is a read-only {@code @Formula} — a SQL subquery executed on load so
 * game_plays remains the single source of truth and no counter needs to be kept in sync.
 */
@Entity
@Table(name = "games")
public class Game {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bgg_id")
    private Integer bggId;

    @NotBlank
    @Column(nullable = false)
    private String title;

    // Sentinel value 99 represents "10+" in the UI.
    @Min(1)
    @Column(name = "min_players", nullable = false)
    private int minPlayers;

    @Min(1)
    @Column(name = "max_players", nullable = false)
    private int maxPlayers;

    // Stored in minutes. Sentinel value 999 represents "4h+" in the UI.
    @Min(0)
    @Column(name = "min_play_time_minutes", nullable = false)
    private int minPlayTimeMinutes;

    @Min(0)
    @Column(name = "max_play_time_minutes", nullable = false)
    private int maxPlayTimeMinutes;

    // Null is meaningfully different from 1.0 — it means "unknown", not "trivially light".
    @DecimalMin("1.0")
    @DecimalMax("5.0")
    @Column(name = "complexity_weight")
    private Double complexityWeight;

    // EAGER so these are always loaded with the Game and never trigger lazy-load
    // exceptions when serialized to JSON outside a transaction.
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "game_categories", joinColumns = @JoinColumn(name = "game_id"))
    @OrderColumn(name = "position")
    @Column(name = "category", nullable = false)
    private List<String> categories = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "game_mechanics", joinColumns = @JoinColumn(name = "game_id"))
    @OrderColumn(name = "position")
    @Column(name = "mechanic", nullable = false)
    private List<String> mechanics = new ArrayList<>();

    // length = 1024 because BGG image URLs can be long.
    @Column(name = "thumbnail_url", length = 1024)
    private String thumbnailUrl;

    @Column(name = "owned_since")
    private LocalDate ownedSince;

    @Min(1)
    @Max(10)
    @Column(name = "personal_rating")
    private Integer personalRating;

    // TEXT rather than VARCHAR(255) — notes can be arbitrarily long.
    @Column(columnDefinition = "TEXT")
    private String notes;

    // Used by SuggestionService to compute a variety bonus — games played recently score lower.
    @Column(name = "last_played_at")
    private LocalDate lastPlayedAt;

    @Column(nullable = false)
    private boolean favorite = false;

    @Column(name = "series_name")
    private String seriesName;

    @Formula("(SELECT COUNT(*) FROM game_plays gp WHERE gp.game_id = id)")
    private int playCount;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Integer getBggId() { return bggId; }
    public void setBggId(Integer bggId) { this.bggId = bggId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public int getMinPlayers() { return minPlayers; }
    public void setMinPlayers(int minPlayers) { this.minPlayers = minPlayers; }

    public int getMaxPlayers() { return maxPlayers; }
    public void setMaxPlayers(int maxPlayers) { this.maxPlayers = maxPlayers; }

    public int getMinPlayTimeMinutes() { return minPlayTimeMinutes; }
    public void setMinPlayTimeMinutes(int minPlayTimeMinutes) { this.minPlayTimeMinutes = minPlayTimeMinutes; }

    public int getMaxPlayTimeMinutes() { return maxPlayTimeMinutes; }
    public void setMaxPlayTimeMinutes(int maxPlayTimeMinutes) { this.maxPlayTimeMinutes = maxPlayTimeMinutes; }

    public Double getComplexityWeight() { return complexityWeight; }
    public void setComplexityWeight(Double complexityWeight) { this.complexityWeight = complexityWeight; }

    public List<String> getCategories() { return categories; }
    // Jackson deserializes an absent JSON array as null; guard so it's always an empty list.
    public void setCategories(List<String> categories) { this.categories = categories != null ? categories : new ArrayList<>(); }

    public List<String> getMechanics() { return mechanics; }
    public void setMechanics(List<String> mechanics) { this.mechanics = mechanics != null ? mechanics : new ArrayList<>(); }

    public String getThumbnailUrl() { return thumbnailUrl; }
    public void setThumbnailUrl(String thumbnailUrl) { this.thumbnailUrl = thumbnailUrl; }

    public LocalDate getOwnedSince() { return ownedSince; }
    public void setOwnedSince(LocalDate ownedSince) { this.ownedSince = ownedSince; }

    public Integer getPersonalRating() { return personalRating; }
    public void setPersonalRating(Integer personalRating) { this.personalRating = personalRating; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public LocalDate getLastPlayedAt() { return lastPlayedAt; }
    public void setLastPlayedAt(LocalDate lastPlayedAt) { this.lastPlayedAt = lastPlayedAt; }

    public boolean isFavorite() { return favorite; }
    public void setFavorite(boolean favorite) { this.favorite = favorite; }

    public int getPlayCount() { return playCount; }

    public String getSeriesName() { return seriesName; }
    public void setSeriesName(String seriesName) { this.seriesName = seriesName; }
}
