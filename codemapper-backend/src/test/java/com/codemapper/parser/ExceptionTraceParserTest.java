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

    // ── Casos reales recolectados de la web ──────────────────────────────

    /** Reflexión — InvocationTargetException + Caused by (ejemplo real de Rollbar/Baeldung). */
    @Test
    void parsesRealReflectionInvocationTargetTrace() {
        String trace = """
                java.lang.reflect.InvocationTargetException
                    at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
                    at java.base/java.lang.reflect.Method.invoke(Method.java:564)
                    at InvocationTargetExceptionExample.main(InvocationTargetExceptionExample.java:13)
                Caused by: java.lang.ArithmeticException: / by zero
                    at InvocationTargetExceptionExample.divideByZero(InvocationTargetExceptionExample.java:6)
                    ... 5 more
                """;
        List<ExceptionCauseDto> causes = parser.parse(trace);

        assertEquals(2, causes.size());
        assertEquals("java.lang.reflect.InvocationTargetException", causes.get(0).getExceptionType());
        assertEquals("java.lang.ArithmeticException", causes.get(1).getExceptionType());
        assertEquals("/ by zero", causes.get(1).getMessage());

        ExceptionFrameDto rootThrow = causes.get(1).getFrames().get(0);
        assertEquals("InvocationTargetExceptionExample", rootThrow.getTopLevelFqn());
        assertEquals("divideByZero", rootThrow.getMethodName());
        assertEquals(6, rootThrow.getLineNumber());

        // El frame nativo no tiene línea.
        assertEquals(0, causes.get(0).getFrames().get(0).getLineNumber());
    }

    /** Kotlin — el archivo es .kt; antes se perdía el número de línea. */
    @Test
    void parsesKotlinFrameWithLineNumber() {
        String trace = """
                kotlin.KotlinNullPointerException: algo salió null
                    at com.foo.BarKt.handle(Bar.kt:10)
                    at com.foo.MainKt.main(Main.kt:3)
                """;
        List<ExceptionCauseDto> causes = parser.parse(trace);

        assertEquals(1, causes.size());
        ExceptionFrameDto top = causes.get(0).getFrames().get(0);
        assertEquals("com.foo.BarKt", top.getTopLevelFqn());
        assertEquals("Bar.kt", top.getFileName());
        assertEquals(10, top.getLineNumber());
    }

    /** Spring CGLIB — el proxy {@code Foo$$EnhancerBySpringCGLIB$$xxx} debe
     *  colapsar a la clase real {@code Foo} para matchear el proyecto. */
    @Test
    void parsesCglibProxyFrameToTopLevelClass() {
        String trace = """
                java.lang.IllegalStateException: boom
                    at com.example.DemoService$$EnhancerBySpringCGLIB$$8972e13d.create(<generated>)
                    at com.example.DemoController.handle(DemoController.java:42)
                """;
        List<ExceptionCauseDto> causes = parser.parse(trace);

        ExceptionFrameDto proxy = causes.get(0).getFrames().get(0);
        assertEquals("com.example.DemoService", proxy.getTopLevelFqn());
        assertEquals("DemoService", proxy.getSimpleName());
        assertEquals(0, proxy.getLineNumber()); // <generated>, sin línea

        assertEquals(42, causes.get(0).getFrames().get(1).getLineNumber());
    }

    /** Apache Spark (caso real SPARK-32784) — frames de Scala (.scala),
     *  métodos sintéticos {@code $$anonfun$...}, {@code sun.reflect} sin
     *  prefijo de módulo, y Caused by ClassNotFoundException + "... 57 more". */
    @Test
    void parsesRealSparkScalaTrace() {
        String trace = """
                java.lang.NoClassDefFoundError: parquet/hadoop/ParquetOutputFormat
                	at java.lang.Class.forName0(Native Method)
                	at org.apache.spark.util.Utils$.classForName(Utils.scala:238)
                	at org.apache.spark.sql.hive.client.HiveClientImpl$$anonfun$toHiveTable$8.apply(HiveClientImpl.scala:949)
                	at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
                	at java.lang.Thread.run(Thread.java:748)
                Caused by: java.lang.ClassNotFoundException: parquet.hadoop.ParquetOutputFormat
                	at java.net.URLClassLoader.findClass(URLClassLoader.java:382)
                	... 57 more
                """;
        List<ExceptionCauseDto> causes = parser.parse(trace);

        assertEquals(2, causes.size());
        assertEquals("java.lang.NoClassDefFoundError", causes.get(0).getExceptionType());
        assertEquals("java.lang.ClassNotFoundException", causes.get(1).getExceptionType());

        // Frame de Scala — ahora con número de línea (antes se perdía).
        ExceptionFrameDto scalaFrame = causes.get(0).getFrames().stream()
                .filter(f -> "Utils.scala".equals(f.getFileName()))
                .findFirst().orElseThrow();
        assertEquals("org.apache.spark.util.Utils", scalaFrame.getTopLevelFqn());
        assertEquals(238, scalaFrame.getLineNumber());

        // El método sintético $$anonfun colapsa a la clase real.
        ExceptionFrameDto anon = causes.get(0).getFrames().stream()
                .filter(f -> f.getMethodName().equals("apply") && f.getLineNumber() == 949)
                .findFirst().orElseThrow();
        assertEquals("org.apache.spark.sql.hive.client.HiveClientImpl", anon.getTopLevelFqn());
    }

    /** Reactor/WebFlux — la decoración (checkpoint, "Error has been observed…",
     *  "Original Stack Trace:") se ignora; los frames reales y el tipo de la
     *  excepción suprimida/encadenada sí se parsean. */
    @Test
    void parsesReactorEnhancedTrace() {
        String trace = """
                java.lang.RuntimeException: boom
                	at com.foo.Service.call(Service.java:20)
                Caused by: reactor.core.publisher.FluxOnAssembly$OnAssemblyException:
                Error has been observed at the following site(s):
                	*__checkpoint ⇢ Request to GET /api [DispatcherHandler]
                Original Stack Trace:
                	at com.foo.Repo.find(Repo.java:55)
                """;
        List<ExceptionCauseDto> causes = parser.parse(trace);

        assertEquals(2, causes.size());
        assertEquals("reactor.core.publisher.FluxOnAssembly$OnAssemblyException",
                causes.get(1).getExceptionType());
        // El frame real bajo "Original Stack Trace" se parseó; la decoración no.
        ExceptionFrameDto real = causes.get(1).getFrames().get(0);
        assertEquals("com.foo.Repo", real.getTopLevelFqn());
        assertEquals(55, real.getLineNumber());
        assertEquals(1, causes.get(1).getFrames().size());
    }
}
