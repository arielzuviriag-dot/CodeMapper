package com.codemapper.service;

import com.codemapper.model.domain.ClassType;
import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.event.FocusClassLoadedEvent;
import com.codemapper.model.event.FocusConnectionEvent;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Heuristic-only comment generator for the FOCO export PDF. No LLM calls,
 * no I/O — pure decisions over the data already in the request.
 *
 * Rules ordered roughly by priority. Each rule that fires contributes one
 * short sentence; the caller joins them with " · ". If nothing fires, the
 * connection has no comment line in the PDF (no filler text).
 */
@Component
public class FocoCommentEngine {

    private static final int LARGE_METHOD_COUNT = 15;
    private static final int LARGE_FIELD_COUNT = 10;

    /**
     * Comments for a single connection. May be empty; never null.
     * Receives the focus class so cross-package / role checks work.
     */
    public List<String> commentsFor(FocusConnectionEvent conn,
                                    FocusClassLoadedEvent focus) {
        List<String> out = new ArrayList<>();
        if (conn == null || focus == null) return out;

        // 1. Cross-package vs same package
        if (!safeEquals(conn.getPackageName(), focus.getPackageName())) {
            out.add("Cross-package — revisar si el acoplamiento justifica el cruce de capas.");
        } else if (conn.getConnectionType() == FocusConnectionType.CALLS
                || conn.getConnectionType() == FocusConnectionType.CALLED_BY) {
            out.add("Misma capa — acoplamiento esperado dentro del módulo.");
        }

        // 2. Spring stereotype on the connection
        Set<String> ann = stripped(conn.getAnnotations());
        boolean isRepository = ann.contains("Repository");
        boolean isController = ann.contains("RestController") || ann.contains("Controller");
        boolean isService = ann.contains("Service");
        boolean isEntity = ann.contains("Entity");

        if (isRepository && conn.getConnectionType() == FocusConnectionType.CALLS) {
            out.add("Acceso directo a capa de datos.");
        } else if (isController && conn.getConnectionType() == FocusConnectionType.CALLED_BY) {
            out.add("Punto de entrada HTTP — esta clase recibe requests externos.");
        } else if (isService && conn.getConnectionType() == FocusConnectionType.CALLS) {
            out.add("Composición de servicios — orquestación de dominio.");
        } else if (isEntity && conn.getConnectionType() == FocusConnectionType.CALLS) {
            out.add("Modelo de dominio JPA — capa persistencia.");
        }

        // 3. Decoupled-by-interface
        if (conn.getType() == ClassType.INTERFACE
                && conn.getConnectionType() == FocusConnectionType.CALLS) {
            out.add("Dependencia por contrato — desacoplamiento por interfaz.");
        }

        // 4. Properties / external config
        if (conn.getConnectionType() == FocusConnectionType.USES_PROPERTIES) {
            out.add("Configuración externa — el comportamiento depende de properties/yml.");
        }

        // 5. Big class — possible refactor candidate
        int methodCount = conn.getMethods() == null ? 0 : conn.getMethods().size();
        int fieldCount = conn.getFields() == null ? 0 : conn.getFields().size();
        if (methodCount > LARGE_METHOD_COUNT || fieldCount > LARGE_FIELD_COUNT) {
            out.add("Clase grande (" + fieldCount + " campos · " + methodCount
                    + " métodos) — revisar single-responsibility.");
        }

        return out;
    }

    /**
     * Cross-cutting comments for the summary section. Receives the full
     * connection list so it can spot patterns across the whole FOCO.
     */
    public List<String> summaryComments(List<FocusConnectionEvent> conns,
                                        FocusClassLoadedEvent focus) {
        List<String> out = new ArrayList<>();
        if (conns == null || conns.isEmpty() || focus == null) return out;

        boolean hasExtends = conns.stream()
                .anyMatch(c -> c.getConnectionType() == FocusConnectionType.EXTENDS);
        boolean hasImplements = conns.stream()
                .anyMatch(c -> c.getConnectionType() == FocusConnectionType.IMPLEMENTS);
        if (hasExtends && hasImplements) {
            out.add("Acoplamiento por jerarquía completa: el foco extiende una clase y además implementa interfaces.");
        }

        long crossPackage = conns.stream()
                .filter(c -> !safeEquals(c.getPackageName(), focus.getPackageName()))
                .count();
        long sameLayer = conns.size() - crossPackage;
        if (crossPackage > 0 && sameLayer > 0) {
            out.add(crossPackage + " conexión(es) cross-package · " + sameLayer
                    + " en la misma capa.");
        }

        return out;
    }

    private static Set<String> stripped(List<String> annotations) {
        if (annotations == null) return Set.of();
        return annotations.stream()
                .map(a -> a.startsWith("@") ? a.substring(1) : a)
                .map(a -> a.split("\\(")[0])
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    private static boolean safeEquals(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }
}
