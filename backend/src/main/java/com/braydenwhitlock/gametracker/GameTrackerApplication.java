package com.braydenwhitlock.gametracker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.time.Clock;

@SpringBootApplication
public class GameTrackerApplication {

    public static void main(String[] args) {
        SpringApplication.run(GameTrackerApplication.class, args);
    }

    /** Injected into time-aware services (e.g. suggestion variety scoring) so tests can pin "today". */
    @Bean
    public Clock systemClock() {
        return Clock.systemDefaultZone();
    }
}
