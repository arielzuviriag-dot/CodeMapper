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
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * P3 — verifies the per-caller classification of how a peripheral relates to
 * the focus. The tracer must label each CALLED_BY connection with one of
 * INVOCATION / INSTANTIATION / INJECTION / DECLARATION, picking the
 * strongest signal when multiple co-exist on the same caller (INVOCATION
 * wins over INSTANTIATION wins over INJECTION wins over DECLARATION).
 */
@SpringBootTest
class FocusTracerReferenceKindTest {

    @Autowired
    private FocusTracerService focusTracerService;

    private Path projectRoot;

    @AfterEach
    void tearDown() {
        FocusTestFixtures.cleanup(projectRoot);
    }

    @Test
    void invocationKindOnBodyMethodCall() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("Focus",
                "package com.demo;\n" +
                "public class Focus {\n" +
                "  public void save() {}\n" +
                "}\n");
        classes.put("CallerInvokes",
                "package com.demo;\n" +
                "public class CallerInvokes {\n" +
                "  private final Focus focus = new Focus();\n" +
                "  public void run() { focus.save(); }\n" +
                "}\n");
        // CallerInvokes also instantiates Focus, but INVOCATION should win.
        FocusConnectionEvent event = runAndFindCalledBy("com.demo.CallerInvokes", "Focus", classes);
        assertEquals(FocusTracerService.KIND_INVOCATION, event.getReferenceKind());
    }

    @Test
    void instantiationKindWhenOnlyNewExpression() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("Focus",
                "package com.demo;\n" +
                "public class Focus {\n" +
                "  public Focus() {}\n" +
                "}\n");
        // Pure factory pattern — instantiates without invoking any method.
        classes.put("CallerInstantiates",
                "package com.demo;\n" +
                "public class CallerInstantiates {\n" +
                "  public Focus build() { return new Focus(); }\n" +
                "}\n");
        FocusConnectionEvent event = runAndFindCalledBy(
                "com.demo.CallerInstantiates", "Focus", classes);
        assertEquals(FocusTracerService.KIND_INSTANTIATION, event.getReferenceKind());
    }

    @Test
    void injectionKindOnAutowiredFieldWithoutBodyUsage() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("Focus",
                "package com.demo;\n" +
                "public class Focus {\n" +
                "  public void save() {}\n" +
                "}\n");
        // @Autowired field, no body invocation. The simple-name match on
        // @Autowired is enough — detectReferenceKind doesn't resolve the
        // Spring annotation symbol, only checks the annotation name.
        classes.put("CallerInjects",
                "package com.demo;\n" +
                "import org.springframework.beans.factory.annotation.Autowired;\n" +
                "public class CallerInjects {\n" +
                "  @Autowired private Focus focus;\n" +
                "  public String describe() { return \"no body usage\"; }\n" +
                "}\n");
        FocusConnectionEvent event = runAndFindCalledBy(
                "com.demo.CallerInjects", "Focus", classes);
        assertEquals(FocusTracerService.KIND_INJECTION, event.getReferenceKind());
    }

    @Test
    void declarationKindOnParameterOnly() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("Focus",
                "package com.demo;\n" +
                "public class Focus {\n" +
                "  public void save() {}\n" +
                "}\n");
        // Focus appears only as a method parameter, never instantiated,
        // never injected, never invoked.
        classes.put("CallerDeclares",
                "package com.demo;\n" +
                "public class CallerDeclares {\n" +
                "  public String describe(Focus f) { return \"only a param\"; }\n" +
                "}\n");
        FocusConnectionEvent event = runAndFindCalledBy(
                "com.demo.CallerDeclares", "Focus", classes);
        assertEquals(FocusTracerService.KIND_DECLARATION, event.getReferenceKind());
    }

    @Test
    void invocationWinsOverInjectionWhenBothPresent() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("Focus",
                "package com.demo;\n" +
                "public class Focus {\n" +
                "  public void save() {}\n" +
                "}\n");
        // Same class has BOTH the DI field AND a real body invocation. The
        // INVOCATION signal must win per the ranking.
        classes.put("CallerBoth",
                "package com.demo;\n" +
                "import org.springframework.beans.factory.annotation.Autowired;\n" +
                "public class CallerBoth {\n" +
                "  @Autowired private Focus focus;\n" +
                "  public void run() { focus.save(); }\n" +
                "}\n");
        FocusConnectionEvent event = runAndFindCalledBy(
                "com.demo.CallerBoth", "Focus", classes);
        assertEquals(FocusTracerService.KIND_INVOCATION, event.getReferenceKind());
    }

    @Test
    void instantiationWinsOverInjectionWhenBothPresent() throws IOException {
        Map<String, String> classes = new HashMap<>();
        classes.put("Focus",
                "package com.demo;\n" +
                "public class Focus {\n" +
                "  public Focus() {}\n" +
                "}\n");
        // @Autowired field AND new Focus(), no method invocation. The
        // ranking should give INSTANTIATION (stronger than INJECTION).
        classes.put("CallerNewAndInjected",
                "package com.demo;\n" +
                "import org.springframework.beans.factory.annotation.Autowired;\n" +
                "public class CallerNewAndInjected {\n" +
                "  @Autowired private Focus injected;\n" +
                "  public Focus build() { return new Focus(); }\n" +
                "}\n");
        FocusConnectionEvent event = runAndFindCalledBy(
                "com.demo.CallerNewAndInjected", "Focus", classes);
        assertEquals(FocusTracerService.KIND_INSTANTIATION, event.getReferenceKind());
    }

    // ─── helpers ─────────────────────────────────────────────────────────

    /** Builds a synthetic project from {@code classes}, runs the tracer with
     *  Focus.java as the focus, and returns the single CALLED_BY event for
     *  the named caller. Fails the test if zero or more than one match. */
    private FocusConnectionEvent runAndFindCalledBy(
            String callerFqn,
            String focusSimpleName,
            Map<String, String> classes) throws IOException {
        projectRoot = FocusTestFixtures.createJavaProject("com.demo", classes);
        Path focusFile = projectRoot.resolve("src/main/java/com/demo/" + focusSimpleName + ".java");

        SessionData session = new SessionData();
        session.setSessionId("test-" + System.nanoTime());
        session.setProjectPath(projectRoot);
        session.setProjectName("ref-kind-fixture");
        session.setTotalFiles(classes.size());
        session.setCreatedAt(Instant.now());
        session.setStatus(SessionData.Status.CREATED);
        session.setOwnsFiles(true);
        session.setPro(true);
        session.setMode(SessionData.Mode.FOCUS);
        session.setFocusFile(focusFile);

        List<BaseEvent> events = new ArrayList<>();
        focusTracerService.traceFocus(session, events::add);

        List<FocusConnectionEvent> matches = events.stream()
                .filter(e -> e instanceof FocusConnectionEvent)
                .map(e -> (FocusConnectionEvent) e)
                .filter(e -> e.getConnectionType() == FocusConnectionType.CALLED_BY)
                .filter(e -> callerFqn.equals(e.getFullyQualifiedName()))
                .collect(Collectors.toList());

        assertEquals(1, matches.size(),
                "expected exactly 1 CALLED_BY event for " + callerFqn + ", got " + matches.size());
        FocusConnectionEvent event = matches.get(0);
        assertNotNull(event.getReferenceKind(), "referenceKind must be populated on CALLED_BY events");
        return event;
    }
}
