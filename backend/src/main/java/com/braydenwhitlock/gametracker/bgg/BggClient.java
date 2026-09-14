package com.braydenwhitlock.gametracker.bgg;

import com.braydenwhitlock.gametracker.bgg.xml.BggSearchResponse;
import com.braydenwhitlock.gametracker.bgg.xml.BggThingResponse;
import com.braydenwhitlock.gametracker.bgg.xml.BggValueAttr;
import com.braydenwhitlock.gametracker.config.CacheConfig;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Client for BoardGameGeek's XML API2.
 *
 * <p>Two endpoints are wrapped: {@code /search} (lightweight, name + year only) and
 * {@code /thing?stats=1} (full metadata). Both are cached via {@link CacheConfig} because
 * BGG rate-limits aggressively and occasionally returns 202 "queued" responses for
 * cold lookups; a 24h TTL means subsequent UI hits never feel that latency.
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

    private final RestClient restClient;
    private final String apiToken;

    public BggClient(@Value("${bgg.base-url:https://boardgamegeek.com}") String baseUrl,
                      @Value("${bgg.api-token:}") String apiToken) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
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
            xml = restClient.get()
                    .uri(uri -> uri.path("/xmlapi2/thing")
                            .queryParam("id", bggId)
                            .queryParam("stats", 1)
                            .build())
                    .headers(this::addAuthHeader)
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException e) {
            log.warn("BGG thing lookup failed for id={} ({})", bggId, e.getStatusCode());
            return Optional.empty();
        }
        return parseThingXml(xml);
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
                linkValues(item.getLinks(), "boardgamemechanic")));
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
