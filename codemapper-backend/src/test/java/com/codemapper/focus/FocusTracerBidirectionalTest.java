package com.codemapper.focus;

import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.domain.SessionData;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import com.codemapper.service.FocusTracerService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * P5 — verifies that the tracer emits BOTH directions when a peripheral
 * has a mutual relationship with the focus. Without this, the bidi
 * curvature work on the frontend has nothing to bow apart.
 */
@SpringBootTest
class FocusTracerBidirectionalTest {

    @Autowired
    private FocusTracerService focusTracerService;

    private Path projectRoot;

    @AfterEach
    void tearDown() {
        FocusTestFixtures.cleanup(projectRoot);
    }

    @Test
    void mutualPairEmitsBothCalledByAndCalls() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("CircularA",
                "package com.demo;\n" +
                "public class CircularA {\n" +
                "  private CircularB b;\n" +
                "  public void doA() { b.doB(); }\n" +
                "}\n");
        classes.put("CircularB",
                "package com.demo;\n" +
                "public class CircularB {\n" +
                "  private CircularA a;\n" +
                "  public void doB() { a.doA(); }\n" +
                "}\n");
        projectRoot = FocusTestFixtures.createJavaProject("com.demo", classes);
        Path focusFile = projectRoot.resolve("src/main/java/com/demo/CircularA.java");

        SessionData session = new SessionData();
        session.setSessionId("test-bidi-" + System.nanoTime());
        session.setProjectPath(projectRoot);
        session.setProjectName("bidi-fixture");
        session.setTotalFiles(2);
        session.setCreatedAt(Instant.now());
        session.setStatus(SessionData.Status.CREATED);
        session.setOwnsFiles(true);
        session.setPro(true);
        session.setMode(SessionData.Mode.FOCUS);
        session.setFocusFile(focusFile);

        List<BaseEvent> events = new ArrayList<>();
        focusTracerService.traceFocus(session, events::add);

        List<FocusConnectionEvent> circBEvents = events.stream()
                .filter(e -> e instanceof FocusConnectionEvent)
                .map(e -> (FocusConnectionEvent) e)
                .filter(e -> "com.demo.CircularB".equals(e.getFullyQualifiedName()))
                .collect(Collectors.toList());

        Set<FocusConnectionType> directions = circBEvents.stream()
                .map(FocusConnectionEvent::getConnectionType)
                .collect(Collectors.toSet());

        assertTrue(directions.contains(FocusConnectionType.CALLED_BY),
                "expected CALLED_BY event for CircularB, got " + directions);
        assertTrue(directions.contains(FocusConnectionType.CALLS),
                "expected CALLS event for CircularB (mutual pair), got " + directions);
        assertEquals(Set.of(FocusConnectionType.CALLED_BY, FocusConnectionType.CALLS), directions,
                "expected exactly both directions, got " + directions);
    }
}
