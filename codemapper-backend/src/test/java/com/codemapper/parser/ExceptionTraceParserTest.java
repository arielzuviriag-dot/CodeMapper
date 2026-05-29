package com.codemapper.parser;

import com.codemapper.model.dto.ExceptionCauseDto;
import com.codemapper.model.dto.ExceptionFrameDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExceptionTraceParserTest {

    private final ExceptionTraceParser parser = new ExceptionTraceParser();

    @Test
    void parsesSimpleTraceWithFramesAndLines() {
        String trace = """
                java.lang.NullPointerException: Cannot invoke "User.getName()" because "user" is null
                    at com.reserva.service.AuthService.login(AuthService.java:42)
                    at com.reserva.controller.AuthController.doLogin(AuthController.java:28)
                """;
        List<ExceptionCauseDto> causes = parser.parse(trace);

        assertEquals(1, causes.size());
        ExceptionCauseDto head = causes.get(0);
        assertEquals("java.lang.NullPointerException", head.getExceptionType());
        assertTrue(head.getMessage().contains("user"));
        assertEquals(2, head.getFrames().size());

        ExceptionFrameDto top = head.getFrames().get(0);
        assertEquals("com.reserva.service.AuthService", top.getTopLevelFqn());
        assertEquals("AuthService", top.getSimpleName());
        assertEquals("login", top.getMethodName());
        assertEquals("AuthService.java", top.getFileName());
        assertEquals(42, top.getLineNumber());
        assertFalse(top.isUserCode()); // parser doesn't resolve project — service does
    }

    @Test
    void parsesCausedByChainAndPicksDeepestSection() {
        String trace = """
                org.springframework.web.util.NestedServletException: Request processing failed
                    at org.springframework.web.servlet.FrameworkServlet.doPost(FrameworkServlet.java:909)
                    at com.reserva.controller.AuthController.doLogin(AuthController.java:28)
                Caused by: java.lang.IllegalStateException: bad state
                    at com.reserva.service.AuthService.login(AuthService.java:42)
                Caused by: java.sql.SQLException: connection is null
                    at com.reserva.repository.UserRepository.find(UserRepository.java:15)
                    ... 23 more
                """;
        List<ExceptionCauseDto> causes = parser.parse(trace);

        assertEquals(3, causes.size());
        assertEquals("org.springframework.web.util.NestedServletException", causes.get(0).getExceptionType());
        assertEquals("java.sql.SQLException", causes.get(2).getExceptionType());

        // deepest cause's first frame = root-cause throw site
        ExceptionFrameDto rootThrow = causes.get(2).getFrames().get(0);
        assertEquals("com.reserva.repository.UserRepository", rootThrow.getTopLevelFqn());
        assertEquals(15, rootThrow.getLineNumber());
    }

    @Test
    void toleratesLogPrefixesNativeFramesAndInnerClasses() {
        String trace = """
                2024-05-29 10:00:00.123 ERROR [main] java.lang.RuntimeException: boom
                    at com.reserva.Outer$Inner.handle(Outer.java:88)
                    at java.base/java.lang.Thread.run(Native Method)
                """;
        List<ExceptionCauseDto> causes = parser.parse(trace);

        assertEquals(1, causes.size());
        assertEquals("java.lang.RuntimeException", causes.get(0).getExceptionType());

        ExceptionFrameDto inner = causes.get(0).getFrames().get(0);
        // $Inner collapses to the top-level type for project matching
        assertEquals("com.reserva.Outer", inner.getTopLevelFqn());
        assertEquals("Outer", inner.getSimpleName());
        assertEquals(88, inner.getLineNumber());

        ExceptionFrameDto nativeFrame = causes.get(0).getFrames().get(1);
        assertEquals("run", nativeFrame.getMethodName());
        assertNotNull(nativeFrame.getTopLevelFqn());
        assertEquals(0, nativeFrame.getLineNumber()); // no line for Native Method
    }

    @Test
    void emptyInputYieldsNoCauses() {
        assertTrue(parser.parse("").isEmpty());
        assertTrue(parser.parse(null).isEmpty());
        assertTrue(parser.parse("   \n  ").isEmpty());
    }
}
