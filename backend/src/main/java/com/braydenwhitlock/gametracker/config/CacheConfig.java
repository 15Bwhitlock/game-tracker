package com.braydenwhitlock.gametracker.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Caffeine-backed caches for BGG calls.
 *
 * <p>BGG rate-limits aggressively (~2 req/sec) and occasionally returns 202 "queued" responses
 * even for plain GETs. A 24-hour TTL keeps the UI snappy and avoids hammering the upstream when
 * a game is opened or searched repeatedly.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    public static final String BGG_SEARCH_CACHE = "bggSearch";
    public static final String BGG_THING_CACHE = "bggThing";

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager(BGG_SEARCH_CACHE, BGG_THING_CACHE);
        manager.setCaffeine(Caffeine.newBuilder()
                .maximumSize(500)
                .expireAfterWrite(Duration.ofHours(24)));
        return manager;
    }
}
