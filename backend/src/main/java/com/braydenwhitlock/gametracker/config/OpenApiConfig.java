package com.braydenwhitlock.gametracker.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger UI at /swagger-ui/index.html, raw spec at /v3/api-docs — both served by
 * springdoc-openapi, which reflects over the @RestController classes below rather
 * than needing a hand-written spec. No auth/profile gating: the app already has
 * none (single-user, no login — see PLAN.md), so there's nothing extra to protect.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI gameTrackerOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Game Tracker API")
                .description("Personal board game collection tracker — catalog games, log plays, "
                        + "look up BoardGameGeek metadata, and get scored play suggestions.")
                .version("v1"));
    }
}
