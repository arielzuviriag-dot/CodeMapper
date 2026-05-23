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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the "one edge per invoked method" behavior introduced by point 1.
 * For CALLED_BY connections the tracer must emit one FocusConnectionEvent per
 * distinct method invoked on the focus — not per call site, not per caller
 * class. Structural-only relationships (no body invocation) keep the legacy
 * one-event-per-class shape with {@code viaMethodInTarget == null}.
 */
@SpringBootTest
class FocusTracerPerMethodTest {

    @Autowired
    private FocusTracerService focusTracerService;

    private Path projectRoot;

    @AfterEach
    void tearDown() {
        FocusTestFixtures.cleanup(projectRoot);
    }

    @Test
    void emitsOneEventPerInvokedMethod() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("UserRepository",
                "package com.demo;\n" +
                "public class UserRepository {\n" +
                "  public void save(String s) {}\n" +
                "  public void delete(String s) {}\n" +
                "  public String find(String id) { return id; }\n" +
                "}\n");
        // Three calls to save() spread across two methods + one call to
        // delete(). Per the new spec, this should collapse to TWO events:
        // one per invoked method name, not per call site.
        classes.put("UserService",
                "package com.demo;\n" +
                "public class UserService {\n" +
                "  private final UserRepository repo = new UserRepository();\n" +
                "  public void create(String s) {\n" +
                "    repo.save(s);\n" +
                "    repo.save(s);\n" +
                "  }\n" +
                "  public void update(String s) {\n" +
                "    repo.save(s);\n" +
                "  }\n" +
                "  public void remove(String s) {\n" +
                "    repo.delete(s);\n" +
                "  }\n" +
                "}\n");
        projectRoot = FocusTestFixtures.createJavaProject("com.demo", classes);
        Path focusFile = projectRoot.resolve("src/main/java/com/demo/UserRepository.java");

        List<FocusConnectionEvent> calledBy = runAndCollectCalledBy(projectRoot, focusFile);

        // Both events should point at the same caller class (UserService)…
        Set<String> callers = calledBy.stream()
                .map(FocusConnectionEvent::getFullyQualifiedName)
                .collect(Collectors.toSet());
        assertEquals(Set.of("com.demo.UserService"), callers,
                "CALLED_BY events should all be from UserService");

        // …with one event per unique invoked method.
        Set<String> invokedMethods = calledBy.stream()
                .map(FocusConnectionEvent::getViaMethodInTarget)
                .collect(Collectors.toSet());
        assertEquals(Set.of("save", "delete"), invokedMethods,
                "expected one event per invoked focus method (save, delete)");
        assertEquals(2, calledBy.size(),
                "expected exactly 2 CALLED_BY events (one per invoked method), got: " +
                        calledBy.stream()
                                .map(e -> e.getFullyQualifiedName() + "#" + e.getViaMethodInTarget())
                                .toList());
    }

    @Test
    void structuralOnlyEmitsSingleEventWithNullMethod() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("User",
                "package com.demo;\n" +
                "public class User {\n" +
                "  private String name;\n" +
                "  public String getName() { return name; }\n" +
                "}\n");
        // Field-only relationship — no body invocation. The peripheral
        // imports/holds a User but never calls anything on it.
        classes.put("UserController",
                "package com.demo;\n" +
                "public class UserController {\n" +
                "  private final User user = new User();\n" +
                "}\n");
        projectRoot = FocusTestFixtures.createJavaProject("com.demo", classes);
        Path focusFile = projectRoot.resolve("src/main/java/com/demo/User.java");

        List<FocusConnectionEvent> calledBy = runAndCollectCalledBy(projectRoot, focusFile);

        assertEquals(1, calledBy.size(),
                "structural-only relationship should emit exactly 1 CALLED_BY event");
        FocusConnectionEvent event = calledBy.get(0);
        assertEquals("com.demo.UserController", event.getFullyQualifiedName());
        assertNull(event.getViaMethodInTarget(),
                "viaMethodInTarget must be null when no call expression resolved against the focus");
    }

    /** Drives the tracer on a temp-fixture project and captures the
     *  CALLED_BY connection events the SSE sink would receive. PRO mode is
     *  set so the FREE visual cap doesn't truncate the fixture. */
    private List<FocusConnectionEvent> runAndCollectCalledBy(Path projectRoot, Path focusFile) throws IOException {
        SessionData session = new SessionData();
        session.setSessionId("test-" + System.nanoTime());
        session.setProjectPath(projectRoot);
        session.setProjectName("focus-fixture");
        session.setTotalFiles(2);
        session.setCreatedAt(Instant.now());
        session.setStatus(SessionData.Status.CREATED);
        session.setOwnsFiles(true);
        session.setPro(true);
        session.setMode(SessionData.Mode.FOCUS);
        session.setFocusFile(focusFile);

        List<BaseEvent> events = new ArrayList<>();
        focusTracerService.traceFocus(session, events::add);

        List<FocusConnectionEvent> calledBy = events.stream()
                .filter(e -> e instanceof FocusConnectionEvent)
                .map(e -> (FocusConnectionEvent) e)
                .filter(e -> e.getConnectionType() == FocusConnectionType.CALLED_BY)
                .collect(Collectors.toList());
        assertTrue(events.size() >= calledBy.size(),
                "internal sanity: filtered size should not exceed total");
        return calledBy;
    }
}
