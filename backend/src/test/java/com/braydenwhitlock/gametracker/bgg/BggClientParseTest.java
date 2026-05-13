package com.braydenwhitlock.gametracker.bgg;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Drives {@link BggClient}'s static parsers against saved XML fixtures.
 * Catches breakage if BGG tweaks their schema or our Jackson mapping drifts.
 */
class BggClientParseTest {

    @Test
    void parsesSearchHitsFromFixture() throws IOException {
        List<BggSearchHit> hits = BggClient.parseSearchXml(load("bgg/search-catan.xml"));

        assertThat(hits).hasSize(3);
        assertThat(hits.get(0).bggId()).isEqualTo(13);
        assertThat(hits.get(0).name()).isEqualTo("Catan");
        assertThat(hits.get(0).yearPublished()).isEqualTo(1995);

        assertThat(hits.get(1).name()).isEqualTo("Catan: Cities & Knights");
        assertThat(hits.get(1).yearPublished()).isEqualTo(1998);

        // Year missing in fixture → parses to null, not zero
        assertThat(hits.get(2).yearPublished()).isNull();
    }

    @Test
    void emptySearchXmlReturnsEmptyList() {
        assertThat(BggClient.parseSearchXml("")).isEmpty();
        assertThat(BggClient.parseSearchXml(null)).isEmpty();
    }

    @Test
    void malformedSearchXmlReturnsEmptyList() {
        assertThat(BggClient.parseSearchXml("<not-real-xml>")).isEmpty();
    }

    @Test
    void parsesThingDetailsFromFixture() throws IOException {
        Optional<BggGameDetails> result = BggClient.parseThingXml(load("bgg/thing-13.xml"));

        assertThat(result).isPresent();
        BggGameDetails details = result.get();
        assertThat(details.bggId()).isEqualTo(13);
        assertThat(details.title()).isEqualTo("Catan");
        assertThat(details.yearPublished()).isEqualTo(1995);
        assertThat(details.minPlayers()).isEqualTo(3);
        assertThat(details.maxPlayers()).isEqualTo(4);
        assertThat(details.minPlayTimeMinutes()).isEqualTo(60);
        assertThat(details.maxPlayTimeMinutes()).isEqualTo(120);
        assertThat(details.complexityWeight()).isEqualTo(2.34);
        assertThat(details.thumbnailUrl()).contains("thumb");
        assertThat(details.imageUrl()).contains("large");
        assertThat(details.description()).contains("Trade, build, and settle");
    }

    @Test
    void picksPrimaryNameOverAlternates() throws IOException {
        BggGameDetails details = BggClient.parseThingXml(load("bgg/thing-13.xml")).orElseThrow();
        assertThat(details.title()).isEqualTo("Catan");
    }

    @Test
    void splitsLinksIntoCategoriesAndMechanics() throws IOException {
        BggGameDetails details = BggClient.parseThingXml(load("bgg/thing-13.xml")).orElseThrow();

        assertThat(details.categories()).containsExactly("Negotiation", "Economic");
        assertThat(details.mechanics()).containsExactly("Dice Rolling", "Trading");
        // boardgamefamily links are ignored — they're neither category nor mechanic
        assertThat(details.categories()).doesNotContain("Components: Hexagonal Tiles");
        assertThat(details.mechanics()).doesNotContain("Components: Hexagonal Tiles");
    }

    @Test
    void unknownThingIdReturnsEmpty() throws IOException {
        Optional<BggGameDetails> result = BggClient.parseThingXml(load("bgg/thing-unknown.xml"));
        assertThat(result).isEmpty();
    }

    @Test
    void zeroAverageWeightTreatedAsUnrated() throws IOException {
        BggGameDetails details = BggClient.parseThingXml(load("bgg/thing-unrated.xml")).orElseThrow();
        assertThat(details.complexityWeight()).isNull();
    }

    @Test
    void emptyOrMalformedThingXmlReturnsEmpty() {
        assertThat(BggClient.parseThingXml("")).isEmpty();
        assertThat(BggClient.parseThingXml(null)).isEmpty();
        assertThat(BggClient.parseThingXml("<garbage>")).isEmpty();
    }

    private static String load(String path) throws IOException {
        return StreamUtils.copyToString(
                new ClassPathResource(path).getInputStream(), StandardCharsets.UTF_8);
    }
}
