package com.codemapper.focus;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Reusable helpers para tests de FOCO / FOCO PRO. Construyen proyectos Java
 * sintéticos en {@link Files#createTempDirectory} para que cualquier test del
 * paquete focus pueda inyectarlos al pipeline (AnalysisService, FocusTracer,
 * JavaParserService, etc.) sin depender de repos externos.
 *
 * Regla: los fixtures NUNCA leen ni copian C:/Users/ariel/Reserva — ese
 * proyecto está reservado como input de los E2E (Playwright). Para JUnit todo
 * se arma en memoria/disco temporal.
 */
public final class FocusTestFixtures {

    private FocusTestFixtures() {}

    /**
     * Crea un proyecto Java sintético mínimo con la estructura clásica
     * src/main/java/{pkg}/. Devuelve la raíz del proyecto (el padre de src).
     * Los archivos se eliminan con {@link #cleanup(Path)} al final del test.
     *
     * @param packageName paquete base, ej "com.demo"
     * @param classes mapa SimpleClassName → cuerpo del archivo .java completo
     */
    public static Path createJavaProject(String packageName, Map<String, String> classes) throws IOException {
        Path root = Files.createTempDirectory("focus-fixture-");
        Path srcDir = root.resolve("src/main/java").resolve(packageName.replace('.', '/'));
        Files.createDirectories(srcDir);
        for (Map.Entry<String, String> e : classes.entrySet()) {
            Path file = srcDir.resolve(e.getKey() + ".java");
            Files.writeString(file, e.getValue(), StandardCharsets.UTF_8);
        }
        return root;
    }

    /**
     * Proyecto con un par Controller → Service (cadena de 2 hops). Útil para
     * smoke-tests de FOCO donde solo necesitás un grafo trivial.
     */
    public static Path createMinimalControllerServiceProject() throws IOException {
        Map<String, String> files = new HashMap<>();
        files.put("DemoController",
                "package com.demo;\n" +
                "public class DemoController {\n" +
                "  private final DemoService service = new DemoService();\n" +
                "  public String hello() { return service.greet(); }\n" +
                "}\n");
        files.put("DemoService",
                "package com.demo;\n" +
                "public class DemoService {\n" +
                "  public String greet() { return \"hi\"; }\n" +
                "}\n");
        return createJavaProject("com.demo", files);
    }

    /**
     * Proyecto con un ciclo A → B → A para tests de detección de ciclos /
     * límites de profundidad de FocusTracer.
     */
    public static Path createCyclicProject() throws IOException {
        Map<String, String> files = new HashMap<>();
        files.put("ServiceA",
                "package com.demo;\n" +
                "public class ServiceA {\n" +
                "  private ServiceB b;\n" +
                "  public void doIt() { b.doIt(); }\n" +
                "}\n");
        files.put("ServiceB",
                "package com.demo;\n" +
                "public class ServiceB {\n" +
                "  private ServiceA a;\n" +
                "  public void doIt() { a.doIt(); }\n" +
                "}\n");
        return createJavaProject("com.demo", files);
    }

    /**
     * Proyecto vacío (solo carpetas). Útil para verificar que el pipeline no
     * crashea con 0 archivos.
     */
    public static Path createEmptyProject() throws IOException {
        return createJavaProject("com.empty", new HashMap<>());
    }

    /**
     * Borrado recursivo del proyecto temporal. Llamar en @AfterEach o try-with
     * — no falla si el path ya no existe.
     */
    public static void cleanup(Path root) {
        if (root == null || !Files.exists(root)) return;
        try (Stream<Path> walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignored) {}
            });
        } catch (IOException ignored) {}
    }
}
