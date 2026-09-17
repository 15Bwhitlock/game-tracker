package com.braydenwhitlock.gametracker.bgg;

import com.braydenwhitlock.gametracker.bgg.xml.BggSearchResponse;
import com.braydenwhitlock.gametracker.bgg.xml.BggThingResponse;
import com.braydenwhitlock.gametracker.bgg.xml.BggValueAttr;
import com.braydenwhitlock.gametracker.config.CacheConfig;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.ClientHttpRequestFactorySettings;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Client for BoardGameGeek's XML API2.
 *
 * <p>Two endpoints are wrapped: {@code /search} (lightweight, name + year only) and
 * {@code /thing?stats=1} (full metadata). Both are cached via {@link CacheConfig} — BGG
 * rate-limits aggressively, and a 24h TTL means subsequent UI hits never feel that latency.
 * {@code /thing} lookups also retry a few times on their own 202 ("queued, try again
 * shortly") response, distinct from our own cache — see {@link #fetchThingXml}.
 *
 * <p>Since October 2025, BGG requires a registered application's bearer token on every
 * XML API2 request — unauthenticated calls now get a flat 401 (see
 * {@code boardgamegeek.com/using_the_xml_api}). Register at BGG to get a token, then set
 * it via the {@code BGG_API_TOKEN} env var; see PLAN.md's decision log. Without a token,
 * every call 401s and this degrades to empty results exactly as it always has for any
 * other BGG error — no crash, just no data, so the app still runs fine unconfigured.
 */
@Service
public class BggClient {

    private static final Logger log = LoggerFactory.getLogger(BggClient.class);
    private static final XmlMapper XML = new XmlMapper();

    // Identifies us to BGG per their app-registration terms; also just good API citizenship.
    private static final String USER_AGENT =
            "game-tracker/1.0 (+https://github.com/15Bwhitlock/game-tracker; personal, non-commercial)";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(10);
    // BGG returns 202 ("request queued, retry shortly") for /thing lookups it hasn't
    // pre-built on its own end yet — this is a cold-cache condition on *their* side,
    // distinct from our own Caffeine cache. Retry a few times before giving up.
    private static final int THING_MAX_RETRIES = 3;
    private static final Duration THING_RETRY_DELAY = Duration.ofSeconds(2);

    // Matches a bare integer or a range like "3-4"/"3–4" (BGG uses both a hyphen and an
    // en dash depending on endpoint/era) inside text like "Best with 2–4, 6 players".
    private static final Pattern PLAYER_COUNT_TOKEN = Pattern.compile("(\\d+)(?:[-–](\\d+))?");

    private final RestClient restClient;
    private final String apiToken;

    public BggClient(@Value("${bgg.base-url:https://boardgamegeek.com}") String baseUrl,
                      @Value("${bgg.api-token:}") String apiToken) {
        ClientHttpRequestFactory requestFactory = ClientHttpRequestFactoryBuilder.detect()
                .build(ClientHttpRequestFactorySettings.defaults()
                        .withConnectTimeout(CONNECT_TIMEOUT)
                        .withReadTimeout(READ_TIMEOUT));
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .defaultHeader(HttpHeaders.USER_AGENT, USER_AGENT)
                .build();
        this.apiToken = apiToken;
        if (apiToken == null || apiToken.isBlank()) {
            log.warn("No BGG_API_TOKEN configured — BGG requires a registered app token as of "
                    + "Oct 2025, so search/lookup will return empty results until one is set.");
        }
    }

    /**
     * Searches BGG for board games whose name matches {@code query}. Returns an empty list
     * for blank queries or when BGG returns no results.
     *
     * <p>Results are cached by trimmed/lowercased query for 24 hours.
     */
    @Cacheable(value = CacheConfig.BGG_SEARCH_CACHE, key = "#query == null ? '' : #query.trim().toLowerCase()")
    public List<BggSearchHit> search(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        String xml;
        try {
            xml = restClient.get()
                    .uri(uri -> uri.path("/xmlapi2/search")
                            .queryParam("query", query.trim())
                            .queryParam("type", "boardgame")
                            .build())
                    .headers(this::addAuthHeader)
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException e) {
            log.warn("BGG search failed for query={} ({})", query, e.getStatusCode());
            return List.of();
        }
        log.debug("BGG search raw response (first 500 chars): {}", xml != null ? xml.substring(0, Math.min(500, xml.length())) : "null");
        return parseSearchXml(xml);
    }

    /**
     * Fetches full BGG metadata for the given numeric BGG id. Returns empty if BGG has no
     * matching item (e.g. the id was deleted).
     *
     * <p>Results are cached by id for 24 hours.
     */
    @Cacheable(value = CacheConfig.BGG_THING_CACHE, key = "#bggId")
    public Optional<BggGameDetails> getDetails(int bggId) {
        String xml;
        try {
            xml = fetchThingXml(bggId);
        } catch (RestClientResponseException e) {
            log.warn("BGG thing lookup failed for id={} ({})", bggId, e.getStatusCode());
            return Optional.empty();
        }
        return parseThingXml(xml);
    }

    /**
     * Fetches the raw /thing XML, retrying on a 202 ("queued, try again shortly") a few
     * times before giving up. A non-202 response — success or error — returns immediately.
     */
    private String fetchThingXml(int bggId) {
        for (int attempt = 0; attempt <= THING_MAX_RETRIES; attempt++) {
            ResponseEntity<String> response = restClient.get()
                    .uri(uri -> uri.path("/xmlapi2/thing")
                            .queryParam("id", bggId)
                            .queryParam("stats", 1)
                            .build())
                    .headers(this::addAuthHeader)
                    .retrieve()
                    .toEntity(String.class);
            if (response.getStatusCode().value() != 202) {
                return response.getBody();
            }
            if (attempt < THING_MAX_RETRIES) {
                log.debug("BGG thing lookup for id={} still queued (202), retrying in {}", bggId, THING_RETRY_DELAY);
                sleepQuietly(THING_RETRY_DELAY);
            }
        }
        log.warn("BGG thing lookup for id={} still queued after {} retries, giving up", bggId, THING_MAX_RETRIES);
        return null;
    }

    private static void sleepQuietly(Duration duration) {
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Adds the bearer token BGG requires as of Oct 2025, when one is configured. A no-op
     * (request goes out unauthenticated, which BGG will 401) when {@link #apiToken} is blank —
     * that's still handled gracefully by the callers' catch blocks above.
     */
    private void addAuthHeader(HttpHeaders headers) {
        if (apiToken != null && !apiToken.isBlank()) {
            headers.setBearerAuth(apiToken);
        }
    }

    /**
     * Parses a BGG search XML response. Package-private so unit tests can drive it with
     * saved XML fixtures, no network required.
     */
    static List<BggSearchHit> parseSearchXml(String xml) {
        if (xml == null || xml.isBlank()) {
            return List.of();
        }
        BggSearchResponse parsed;
        try {
            parsed = XML.readValue(xml, BggSearchResponse.class);
        } catch (IOException e) {
            log.warn("Failed to parse BGG search XML: {}", e.getMessage());
            return List.of();
        }
        List<BggSearchHit> hits = new ArrayList<>();
        for (BggSearchResponse.Item item : parsed.getItems()) {
            if (item.getId() == null || item.getName() == null || item.getName().getValue() == null) {
                continue;
            }
            hits.add(new BggSearchHit(
                    item.getId(),
                    item.getName().getValue(),
                    parseInteger(item.getYearPublished())));
        }
        return hits;
    }

    /**
     * Parses a BGG thing XML response. Returns empty if no item is present (BGG returns an
     * empty {@code <items/>} for unknown ids).
     */
    static Optional<BggGameDetails> parseThingXml(String xml) {
        if (xml == null || xml.isBlank()) {
            return Optional.empty();
        }
        BggThingResponse parsed;
        try {
            parsed = XML.readValue(xml, BggThingResponse.class);
        } catch (IOException e) {
            log.warn("Failed to parse BGG thing XML: {}", e.getMessage());
            return Optional.empty();
        }
        if (parsed.getItems().isEmpty()) {
            return Optional.empty();
        }
        BggThingResponse.Item item = parsed.getItems().get(0);
        return Optional.of(new BggGameDetails(
                item.getId() != null ? item.getId() : 0,
                primaryName(item.getNames()),
                parseInteger(item.getYearPublished()),
                item.getDescription(),
                item.getThumbnail(),
                item.getImage(),
                parseInteger(item.getMinPlayers()),
                parseInteger(item.getMaxPlayers()),
                parseInteger(item.getMinPlayTime()),
                parseInteger(item.getMaxPlayTime()),
                averageWeight(item),
                linkValues(item.getLinks(), "boardgamecategory"),
                linkValues(item.getLinks(), "boardgamemechanic"),
                bestPlayerCounts(item)));
    }

    /**
     * Reads BGG's own precomputed "bestwith" summary (e.g. "Best with 4 players" or
     * "Best with 2–4 players") from the suggested_numplayers poll and expands it into
     * the individual counts. Package-private so tests can drive it directly.
     */
    static List<Integer> bestPlayerCounts(BggThingResponse.Item item) {
        for (BggThingResponse.PollSummary summary : item.getPollSummaries()) {
            if (!"suggested_numplayers".equals(summary.getName())) continue;
            for (BggThingResponse.PollSummaryResult result : summary.getResults()) {
                if ("bestwith".equals(result.getName()) && result.getValue() != null) {
                    return expandPlayerCountRanges(result.getValue());
                }
            }
        }
        return List.of();
    }

    // Pulls every integer and "N–M"/"N-M" range out of a string like "Best with 2–4, 6
    // players" and expands ranges into individual counts. BGG's punctuation here isn't
    // perfectly consistent (en dash vs hyphen), so both are matched.
    static List<Integer> expandPlayerCountRanges(String text) {
        Set<Integer> counts = new java.util.TreeSet<>();
        Matcher matcher = PLAYER_COUNT_TOKEN.matcher(text);
        while (matcher.find()) {
            int from = Integer.parseInt(matcher.group(1));
            String toGroup = matcher.group(2);
            int to = toGroup != null ? Integer.parseInt(toGroup) : from;
            for (int n = from; n <= to && n - from < 20; n++) {
                counts.add(n);
            }
        }
        return new ArrayList<>(counts);
    }

    private static String primaryName(List<BggValueAttr> names) {
        if (names == null || names.isEmpty()) {
            return null;
        }
        for (BggValueAttr name : names) {
            if ("primary".equalsIgnoreCase(name.getType())) {
                return name.getValue();
            }
        }
        return names.get(0).getValue();
    }

    private static List<String> linkValues(List<BggThingResponse.Link> links, String type) {
        if (links == null || links.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (BggThingResponse.Link link : links) {
            if (type.equalsIgnoreCase(link.getType()) && link.getValue() != null) {
                out.add(link.getValue());
            }
        }
        return out;
    }

    private static Double averageWeight(BggThingResponse.Item item) {
        if (item.getStatistics() == null
                || item.getStatistics().getRatings() == null
                || item.getStatistics().getRatings().getAverageWeight() == null) {
            return null;
        }
        String value = item.getStatistics().getRatings().getAverageWeight().getValue();
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            double parsed = Double.parseDouble(value);
            // BGG returns 0.0 for unrated games; treat as "unknown" rather than "trivially light".
            return parsed > 0.0 ? parsed : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer parseInteger(BggValueAttr attr) {
        if (attr == null || attr.getValue() == null || attr.getValue().isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(attr.getValue());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
