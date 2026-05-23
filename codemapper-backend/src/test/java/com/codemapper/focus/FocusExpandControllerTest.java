package com.codemapper.focus;

import com.codemapper.model.domain.SessionData;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import com.codemapper.service.FocusTracerService;
import com.codemapper.service.SessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P4 — verifies the {@code POST /api/analyze/focus/{sessionId}/expand}
 * endpoint end-to-end through MockMvc against synthetic fixtures. Covers
 * the PRO-only gate, the unknown-peripheral 404 path, and the dedupe
 * (response must NOT contain FQNs already present in the parent session).
 */
@SpringBootTest
@AutoConfigureMockMvc
class FocusExpandControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private SessionService sessionService;
    @Autowired private FocusTracerService focusTracerService;
    @Autowired private ObjectMapper objectMapper;

    private Path projectRoot;
    private String proSessionId;
    private String freeSessionId;
    private String knownPeripheralFqn;

    /** Builds a 3-class chain (Focus → Mid → Leaf) where Mid invokes Focus
     *  and also invokes Leaf. After running the level-1 trace on Focus,
     *  Mid lives in the parent session but Leaf does not — that's the
     *  peripheral whose expansion should add the brand-new node.
     *
     *  Returns the sessionId of the freshly-created session (pro flag
     *  controlled by the caller). */
    private String buildSession(boolean pro) throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("Focus",
                "package com.demo;\n" +
                "public class Focus {\n" +
                "  public void save() {}\n" +
                "}\n");
        classes.put("Mid",
                "package com.demo;\n" +
                "public class Mid {\n" +
                "  private final Focus focus = new Focus();\n" +
                "  private final Leaf leaf = new Leaf();\n" +
                "  public void run() {\n" +
                "    focus.save();\n" +
                "    leaf.ping();\n" +
                "  }\n" +
                "}\n");
        classes.put("Leaf",
                "package com.demo;\n" +
                "public class Leaf {\n" +
                "  public void ping() {}\n" +
                "}\n");
        projectRoot = FocusTestFixtures.createJavaProject("com.demo", classes);
        Path focusFile = projectRoot.resolve("src/main/java/com/demo/Focus.java");

        SessionData session = sessionService.createSession(
                projectRoot, "expand-fixture", 3, true, pro);
        session.setMode(SessionData.Mode.FOCUS);
        session.setFocusFile(focusFile);

        // Run the level-1 trace so parsedClasses gets populated with Focus + Mid.
        // The events are discarded — we only care about the side effect on
        // session.parsedClasses, which is what expandPeripheral inspects.
        focusTracerService.traceFocus(session, ev -> {});
        knownPeripheralFqn = session.getParsedClasses().stream()
                .map(c -> c.getFullyQualifiedName())
                .filter("com.demo.Mid"::equals)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Level-1 trace did not surface Mid"));
        return session.getSessionId();
    }

    @AfterEach
    void tearDown() {
        if (proSessionId != null) sessionService.deleteSession(proSessionId);
        if (freeSessionId != null) sessionService.deleteSession(freeSessionId);
        FocusTestFixtures.cleanup(projectRoot);
        proSessionId = null;
        freeSessionId = null;
        projectRoot = null;
    }

    @Test
    void proSessionReturns200WithConnectionsExcludingParentFqns() throws Exception {
        proSessionId = buildSession(true);

        MvcResult result = mockMvc.perform(post("/api/analyze/focus/{sessionId}/expand", proSessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"peripheralFqn\":\"" + knownPeripheralFqn + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.peripheralFqn").value(knownPeripheralFqn))
                .andExpect(jsonPath("$.connections").isArray())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsByteArray());
        JsonNode connections = body.get("connections");
        assertTrue(connections.size() > 0, "expected at least one expansion connection");

        // Parent session already contains Focus and Mid — neither must come
        // back in the expansion payload.
        Set<String> parentFqns = sessionService.getSession(proSessionId).getParsedClasses().stream()
                .map(c -> c.getFullyQualifiedName())
                .collect(java.util.stream.Collectors.toCollection(HashSet::new));
        for (JsonNode conn : connections) {
            String fqn = conn.get("fullyQualifiedName").asText();
            assertFalse(parentFqns.contains(fqn),
                    "expansion must not echo a known parent FQN, but found " + fqn);
        }
    }

    @Test
    void freeSessionReturns403WithSpanishPaywallMessage() throws Exception {
        freeSessionId = buildSession(false);

        mockMvc.perform(post("/api/analyze/focus/{sessionId}/expand", freeSessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"peripheralFqn\":\"" + knownPeripheralFqn + "\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("PRO")));
    }

    @Test
    void unknownPeripheralFqnReturns404() throws Exception {
        proSessionId = buildSession(true);

        mockMvc.perform(post("/api/analyze/focus/{sessionId}/expand", proSessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"peripheralFqn\":\"com.nope.Ghost\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("com.nope.Ghost")));
    }

    @Test
    void unknownSessionIdReturns404() throws Exception {
        mockMvc.perform(post("/api/analyze/focus/{sessionId}/expand", "no-such-session")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"peripheralFqn\":\"com.demo.Mid\"}"))
                .andExpect(status().isNotFound());
    }
}
