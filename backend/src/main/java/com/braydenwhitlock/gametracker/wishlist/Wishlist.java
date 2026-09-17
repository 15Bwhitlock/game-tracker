package com.braydenwhitlock.gametracker.wishlist;

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
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * A game the user doesn't own yet, kept for future reference.
 *
 * Deliberately lighter than {@code Game} — no play-tracking fields (ownedSince,
 * personalRating, lastPlayedAt, favorite, seriesName), since none of that applies
 * before a game is actually owned. Most fields are nullable, unlike {@code Game}'s
 * required player-count/play-time — a wishlist entry can be sparse (e.g. added from
 * BGG's hot list before a full lookup, or a bare manual note).
 */
@Entity
@Table(name = "wishlist_items")
public class Wishlist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bgg_id")
    private Integer bggId;

    @NotBlank
    @Column(nullable = false)
    private String title;

    @Column(name = "thumbnail_url", length = 1024)
    private String thumbnailUrl;

    @Column(name = "image_url", length = 1024)
    private String imageUrl;

    @Column(name = "year_published")
    private Integer yearPublished;

    @Column(name = "min_players")
    private Integer minPlayers;

    @Column(name = "max_players")
    private Integer maxPlayers;

    @Column(name = "min_play_time_minutes")
    private Integer minPlayTimeMinutes;

    @Column(name = "max_play_time_minutes")
    private Integer maxPlayTimeMinutes;

    @Column(name = "complexity_weight")
    private Double complexityWeight;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "wishlist_categories", joinColumns = @JoinColumn(name = "item_id"))
    @OrderColumn(name = "position")
    @Column(name = "category", nullable = false)
    private List<String> categories = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "wishlist_mechanics", joinColumns = @JoinColumn(name = "item_id"))
    @OrderColumn(name = "position")
    @Column(name = "mechanic", nullable = false)
    private List<String> mechanics = new ArrayList<>();

    // TEXT rather than VARCHAR(255) — same reasoning as Game.notes.
    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "added_at", nullable = false)
    private LocalDate addedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Integer getBggId() { return bggId; }
    public void setBggId(Integer bggId) { this.bggId = bggId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getThumbnailUrl() { return thumbnailUrl; }
    public void setThumbnailUrl(String thumbnailUrl) { this.thumbnailUrl = thumbnailUrl; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public Integer getYearPublished() { return yearPublished; }
    public void setYearPublished(Integer yearPublished) { this.yearPublished = yearPublished; }

    public Integer getMinPlayers() { return minPlayers; }
    public void setMinPlayers(Integer minPlayers) { this.minPlayers = minPlayers; }

    public Integer getMaxPlayers() { return maxPlayers; }
    public void setMaxPlayers(Integer maxPlayers) { this.maxPlayers = maxPlayers; }

    public Integer getMinPlayTimeMinutes() { return minPlayTimeMinutes; }
    public void setMinPlayTimeMinutes(Integer minPlayTimeMinutes) { this.minPlayTimeMinutes = minPlayTimeMinutes; }

    public Integer getMaxPlayTimeMinutes() { return maxPlayTimeMinutes; }
    public void setMaxPlayTimeMinutes(Integer maxPlayTimeMinutes) { this.maxPlayTimeMinutes = maxPlayTimeMinutes; }

    public Double getComplexityWeight() { return complexityWeight; }
    public void setComplexityWeight(Double complexityWeight) { this.complexityWeight = complexityWeight; }

    public List<String> getCategories() { return categories; }
    public void setCategories(List<String> categories) { this.categories = categories != null ? categories : new ArrayList<>(); }

    public List<String> getMechanics() { return mechanics; }
    public void setMechanics(List<String> mechanics) { this.mechanics = mechanics != null ? mechanics : new ArrayList<>(); }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public LocalDate getAddedAt() { return addedAt; }
    public void setAddedAt(LocalDate addedAt) { this.addedAt = addedAt; }
}
