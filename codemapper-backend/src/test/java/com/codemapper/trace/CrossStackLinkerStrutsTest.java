package com.codemapper.trace;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.ConnectionType;
import com.codemapper.model.domain.ParsedClass;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.ClassFoundEvent;
import com.codemapper.model.event.ConnectionFoundEvent;
import com.codemapper.parser.MobileEndpointScanner;
import com.codemapper.service.CrossStackLinker;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Synthetic validation of the Struts/XML adapter: a struts.xml action →
 * Action class, and a JSP {@code <form action="/x.action">} → must produce a
 * WEB_SCREEN node for the JSP and an HTTP_CALL edge to the Action class. No
 * Spring annotations involved — proves cross-stack linking works for classic
 * MVC frameworks that route via config, not annotations.
 */
class CrossStackLinkerStrutsTest {

    private final CrossStackLinker linker = new CrossStackLinker(new MobileEndpointScanner());

    @Test
    void linksJspFormToStrutsActionClass(@TempDir Path root) throws Exception {
        // struts.xml (Struts 2): /admin/listUsers → com.demo.UserAction
        Path webInf = Files.createDirectories(root.resolve("WEB-INF"));
        Files.writeString(webInf.resolve("struts.xml"), """
            <?xml version="1.0" encoding="UTF-8"?>
            <struts>
              <package name="admin" namespace="/admin" extends="struts-default">
                <action name="listUsers" class="com.demo.UserAction" method="list">
                  <result>/WEB-INF/users.jsp</result>
                </action>
              </package>
            </struts>
            """);

        // The JSP front: a form posting to the action URL (with .action ext).
        Path webapp = Files.createDirectories(root.resolve("webapp"));
        Files.writeString(webapp.resolve("users.jsp"), """
            <html><body>
              <form action="/admin/listUsers.action" method="post">
                <input name="q"/>
              </form>
            </body></html>
            """);

        // The parsed Action class (as the Java parser would have produced it).
        ParsedClass action = new ParsedClass();
        action.setId("user-action");
        action.setName("UserAction");
        action.setFullyQualifiedName("com.demo.UserAction");
        action.setType(ClassType.CLASS);
        action.setFilePath(root.resolve("UserAction.java").toString());

        List<BaseEvent> events = new ArrayList<>();
        // projectRoot + frontendPath = the same root (Struts apps mix JSP + Java).
        linker.streamWebLinks(List.of(action), root.toString(), root.toString(), "web", events::add);

        // A screen node for the JSP (web or mobile — this test is about the
        // Struts path→Action link, not the web/mobile classification).
        List<ClassFoundEvent> screenNodes = events.stream()
                .filter(e -> e instanceof ClassFoundEvent)
                .map(e -> (ClassFoundEvent) e)
                .filter(e -> e.getType() == ClassType.WEB_SCREEN
                        || e.getType() == ClassType.MOBILE_SCREEN)
                .toList();
        assertThat(screenNodes).anyMatch(n -> "users.jsp".equals(n.getName()));

        String jspId = screenNodes.stream()
                .filter(n -> "users.jsp".equals(n.getName()))
                .findFirst().orElseThrow().getId();

        // An HTTP_CALL edge JSP → the Struts Action class.
        List<ConnectionFoundEvent> edges = events.stream()
                .filter(e -> e instanceof ConnectionFoundEvent)
                .map(e -> (ConnectionFoundEvent) e)
                .filter(e -> e.getType() == ConnectionType.HTTP_CALL)
                .toList();
        assertThat(edges).anyMatch(
                e -> e.getFrom().equals(jspId) && e.getTo().equals("user-action"));
    }
}
