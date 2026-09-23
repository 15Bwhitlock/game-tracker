package com.braydenwhitlock.gametracker.ai;

import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.TextBlock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Thin wrapper around the Anthropic Messages API — used only to write a one-sentence
 * description for a board-game category/mechanic name (see TagDescriptionService).
 *
 * <p>Mirrors {@link com.braydenwhitlock.gametracker.bgg.BggClient}'s graceful-degradation
 * pattern: without an {@code ANTHROPIC_API_KEY}, every call is skipped and this returns
 * {@link Optional#empty()} — no crash, the app runs fine unconfigured, callers just get
 * no description.
 */
@Service
public class AnthropicClient {

    private static final Logger log = LoggerFactory.getLogger(AnthropicClient.class);

    private static final String SYSTEM_PROMPT = """
            You write a single, short, neutral sentence describing a board game category or \
            mechanic, in the style of these existing examples:

            - Strategy (category): Long-term planning and decision-making are central to winning
            - Worker Placement (mechanic): Players place worker tokens on action spaces to claim \
            them before others
            - Deck, Bag, and Pool Building (mechanic): Players acquire cards, tokens, or dice to \
            improve a pool they draw from during the game

            Reply with only the sentence itself — no quotes, no label, no trailing period unless \
            the sentence needs one mid-sentence.""";

    private final com.anthropic.client.AnthropicClient client;
    private final boolean configured;

    public AnthropicClient(@Value("${anthropic.api-key:}") String apiKey) {
        this.configured = apiKey != null && !apiKey.isBlank();
        this.client = configured
                ? AnthropicOkHttpClient.builder().apiKey(apiKey).build()
                : null;
        if (!configured) {
            log.warn("No ANTHROPIC_API_KEY configured — auto-generated tag descriptions "
                    + "are disabled until one is set.");
        }
    }

    /** True if an {@code ANTHROPIC_API_KEY} was configured at startup. */
    public boolean isConfigured() {
        return configured;
    }

    /**
     * Asks Claude for a one-sentence description of {@code name} (a category or mechanic,
     * per {@code kind}, e.g. "category"/"mechanic"). Empty on any failure — no key, network
     * error, empty/refused response — never throws into the caller.
     */
    public Optional<String> describeTag(String name, String kind) {
        if (!configured) {
            return Optional.empty();
        }
        try {
            MessageCreateParams params = MessageCreateParams.builder()
                    .model("claude-opus-5")
                    .maxTokens(100L)
                    .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
                    .system(SYSTEM_PROMPT)
                    .addUserMessage("Board game " + kind + ": \"" + name + "\"")
                    .build();
            Message response = client.messages().create(params);
            return response.content().stream()
                    .flatMap(block -> block.text().stream())
                    .map(TextBlock::text)
                    .findFirst()
                    .map(String::trim)
                    .filter(s -> !s.isEmpty());
        } catch (AnthropicServiceException e) {
            log.warn("Anthropic API call failed while describing tag '{}': {}", name, e.getMessage());
            return Optional.empty();
        } catch (RuntimeException e) {
            log.warn("Unexpected error calling Anthropic API for tag '{}': {}", name, e.getMessage());
            return Optional.empty();
        }
    }
}
