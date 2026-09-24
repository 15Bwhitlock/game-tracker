package com.braydenwhitlock.gametracker.ai;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Only the graceful-degradation path is unit-testable without hitting the real API — the
 * happy path (a real Anthropic call) isn't something a unit test should exercise; that's
 * covered by manual verification against the live dev backend (see PLAN.md).
 */
class AnthropicClientTest {

    @Test
    void blankApiKeyMeansEveryCallReturnsEmptyWithoutMakingARequest() {
        AnthropicClient client = new AnthropicClient("");
        Optional<String> result = client.describeTag("Take That", "mechanic");
        assertThat(result).isEmpty();
    }

    @Test
    void nullApiKeyAlsoDegradesGracefully() {
        AnthropicClient client = new AnthropicClient(null);
        assertThat(client.describeTag("Open Drafting", "mechanic")).isEmpty();
    }
}
