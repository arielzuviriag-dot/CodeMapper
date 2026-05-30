package com.codemapper.model.dto.trace;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Body of {@code POST /api/trace/export/pdf} — the "Escuchando" mode export.
 *
 * <p>Stateless, like the FOCO export: the frontend ships exactly the graph it
 * is currently showing (the nodes built by {@code buildTraceGraph} for the
 * active view + URL filter) plus a PNG snapshot of the on-screen map. The
 * backend only formats it into a PDF — no re-analysis, so the report mirrors
 * the screen.
 */
@Data
@NoArgsConstructor
public class TraceExportRequest {

    /** Active node-type view: "all" | "web" | "java" (for the report header). */
    private String view;

    /** URL substring filter in effect, or empty/null for "escuchar todo". */
    private String urlFilter;

    /** Display name of the root/entry node, if any. */
    private String rootClassName;

    /**
     * PNG snapshot of the on-screen graph as a data URL or bare base64. May be
     * null/blank — the PDF then ships the detail table only.
     */
    private String imageBase64;

    /** The nodes on screen, in the order the frontend wants them listed. */
    private List<TraceNodeDto> nodes;

    /**
     * One row of the detail table: an object that ran, with how many times it
     * was hit, whether it's a Web (HTTP) entry or a Java class, and its
     * execution order.
     */
    @Data
    @NoArgsConstructor
    public static class TraceNodeDto {
        /** Display label — a Java class name or an HTTP route ("GET /api/x"). */
        private String className;
        /** Fully-qualified class name when it's a Java node; null for Web. */
        private String fqcn;
        /** True = Web (HTTP entry), false = Java class. */
        private boolean http;
        /** How many spans hit this object — the "cuántas veces se llama". */
        private int hitCount;
        /** 1-based execution order (by earliest span start time). */
        private int order;
        /** BFS depth from the root (0 = entry). */
        private int depth;
        /** Distinct methods seen on this class, in first-seen order. */
        private List<String> methods;
        /** "OK" | "ERROR" | "UNSET". */
        private String status;
    }
}
