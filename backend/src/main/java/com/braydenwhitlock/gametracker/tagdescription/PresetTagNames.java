package com.braydenwhitlock.gametracker.tagdescription;

import java.util.Set;

/**
 * Names already curated with a hand-written description on the frontend
 * (frontend/src/app/shared/models/game-categories.ts and game-mechanics.ts) — kept in
 * sync manually. Used purely to skip an unnecessary AI call when a saved category/
 * mechanic happens to already be one of these; if this list ever drifts out of sync, the
 * worst case is one wasted (harmless) AI-generated row, not a bug.
 */
final class PresetTagNames {

    private PresetTagNames() {}

    static final Set<String> CATEGORIES = Set.of(
            "Strategy",
            "Family",
            "Card Game",
            "Party Game",
            "Abstract Strategy",
            "Economic",
            "Dice",
            "Tile Game",
            "Fantasy",
            "Wargame",
            "Medieval",
            "Science Fiction",
            "World War II",
            "Social Deduction",
            "Hidden Roles",
            "Dungeon Crawler",
            "Negotiation",
            "Children's Game",
            "Puzzle",
            "Roll & Write",
            "Horror",
            "Ancient",
            "Trivia",
            "Word Game",
            "Space",
            "Humor",
            "Mythology",
            "Pirates",
            "Miniatures",
            "Western",
            "Modern Warfare"
    );

    static final Set<String> MECHANICS = Set.of(
            "Dice Rolling",
            "Hand Management",
            "Set Collection",
            "Tile Placement",
            "Worker Placement",
            "Deck, Bag, and Pool Building",
            "Area Control",
            "Cooperative Game",
            "Trading",
            "Auction / Bidding",
            "Card Drafting",
            "Trick-taking",
            "Push Your Luck",
            "Press Your Luck",
            "Tableau Building",
            "Hand Building",
            "Grid Movement",
            "Point to Point Movement",
            "Modular Board",
            "Route Building",
            "Network Building",
            "Pattern Building",
            "Hex-and-Counter",
            "Enclosure",
            "Engine Building",
            "Resource Management",
            "Market",
            "Income",
            "Tech Trees / Upgrades",
            "Commodity Speculation",
            "Bluffing",
            "Deduction",
            "Hidden Roles",
            "Hidden Movement",
            "Negotiation",
            "Secret Unit Deployment",
            "Memory",
            "Voting",
            "Action Points",
            "Variable Player Powers",
            "Simultaneous Action Selection",
            "Role Selection",
            "Action Queue",
            "Rondel",
            "Time Track",
            "Legacy / Campaign",
            "Storytelling",
            "Choose Your Own Adventure",
            "Scenario / Mission / Campaign Game",
            "Bag Building",
            "Roll & Write",
            "Flip & Write",
            "Polyomino",
            "Drafting",
            "Real-Time",
            "Solo / Solitaire Game",
            "Semi-Cooperative",
            "Dungeon Crawl",
            "Tower Defense"
    );
}
