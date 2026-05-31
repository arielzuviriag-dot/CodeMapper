package com.codemapper.controller;

import com.codemapper.model.dto.trace.TraceExportRequest;
import com.codemapper.model.dto.trace.TraceSpanDto;
import com.codemapper.service.OtlpProtobufParser;
import com.codemapper.service.OtlpTraceParser;
import com.codemapper.service.TraceBroadcaster;
import com.codemapper.service.TracePdfService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * "Escuchando" mode — live execution tracing.
 *
 * <p>Two endpoints, intentionally on different paths/ports of concern:
 * <ul>
 *   <li>{@code POST /v1/traces} — the OTLP/HTTP JSON ingest the OpenTelemetry
 *       Java agent posts to. Server-to-server (no CORS). Must ALWAYS answer
 *       200 with {@code {}} so the agent's exporter doesn't flag an error and
 *       back off, even when the payload is partial/garbage.</li>
 *   <li>{@code GET /api/trace/stream} — the SSE stream the browser subscribes
 *       to when the user hits "Iniciar". Each ingested span is fanned out here
 *       as a "span" event.</li>
 * </ul>
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class TraceController {

    private final OtlpTraceParser jsonParser;
    private final OtlpProtobufParser protobufParser;
    private final TraceBroadcaster broadcaster;
    private final TracePdfService tracePdfService;
    private final com.codemapper.service.CrossStackLinker crossStackLinker;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * OTLP/HTTP ingest. The agent appends {@code /v1/traces} to
     * {@code otel.exporter.otlp.endpoint}, so pointing it at
     * {@code http://localhost:8090} lands here.
     *
     * <p>Accepts the raw body as bytes and picks the parser by Content-Type:
     * the real OpenTelemetry Java agent sends {@code application/x-protobuf};
     * tools/tests may send {@code application/json}. Always answers 200 with
     * {@code {}} so the exporter never flags an error and backs off, even when
     * the body is partial/garbage.
     */
    @PostMapping(value = "/v1/traces")
    public ResponseEntity<Map<String, Object>> ingest(
            @RequestBody(required = false) byte[] body,
            @RequestHeader(value = "Content-Type", required = false) String contentType) {
        try {
            List<TraceSpanDto> spans = isJson(contentType)
                    ? jsonParser.parse(body == null ? null : objectMapper.readValue(body, Map.class))
                    : protobufParser.parse(body);
            if (!spans.isEmpty()) {
                log.debug("Ingested {} span(s) [{}], {} listener(s)",
                        spans.size(), contentType, broadcaster.listenerCount());
            }
            for (TraceSpanDto span : spans) {
                broadcaster.broadcast(span);
            }
        } catch (Exception e) {
            // Never let a bad batch turn into a non-200 — that would make the
            // exporter retry/disable. Log and move on.
            log.warn("Failed to process OTLP batch: {}", e.getMessage());
        }
        return ResponseEntity.ok(Map.of());
    }

    /** JSON when the content type says so; otherwise assume OTLP protobuf
     *  (the agent default, sent as application/x-protobuf). */
    private boolean isJson(String contentType) {
        return contentType != null && contentType.toLowerCase().contains("json");
    }

    /** Browser subscribes here on "Iniciar". Long-lived, broadcast SSE. */
    @GetMapping(value = "/api/trace/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return broadcaster.register();
    }

    /**
     * "Escuchar" mode — scan a front-end project for screens that call the
     * backend, so the live graph can show which screen triggered each request.
     * Body: {@code {"path": "C:/.../front"}}. Returns the screen calls.
     */
    @PostMapping(value = "/api/trace/frontend-scan",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<com.codemapper.service.CrossStackLinker.ScreenCall>> frontendScan(
            @RequestBody Map<String, String> body) {
        String path = body == null ? null : body.get("path");
        if (path == null || path.isBlank()) {
            return ResponseEntity.ok(List.of());
        }
        return ResponseEntity.ok(crossStackLinker.scanScreens(path));
    }

    /**
     * "Escuchar" mode — resolve a class's source by fqcn under a backend project
     * path, so clicking a node in the live graph can show its code (no session).
     * Body: {@code {"backendPath": "...", "fqcn": "com.x.Foo"}}.
     */
    @PostMapping(value = "/api/trace/source",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> source(@RequestBody Map<String, String> body) {
        String backendPath = body == null ? null : body.get("backendPath");
        String fqcn = body == null ? null : body.get("fqcn");
        var src = crossStackLinker.resolveJavaSource(backendPath, fqcn);
        if (src == null) {
            return ResponseEntity.ok(Map.of("found", false));
        }
        return ResponseEntity.ok(Map.of(
                "found", true,
                "fqcn", src.fqcn(),
                "filePath", src.filePath(),
                "source", src.source()));
    }

    /**
     * Renders the live "Escuchando" graph as a PDF. Stateless, like the FOCO
     * export: the browser posts the on-screen nodes (order, Web/Java, hit count)
     * plus a PNG snapshot, and we format it. No re-analysis — the PDF mirrors
     * the screen, including the active view/URL filter.
     */
    @PostMapping(value = "/api/trace/export/pdf",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> exportPdf(@RequestBody TraceExportRequest request) {
        if (request == null) {
            return ResponseEntity.badRequest().build();
        }
        byte[] pdf = tracePdfService.generatePdf(request);
        String filename = "codemapper-escuchando.pdf";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setContentLength(pdf.length);
        log.info("Generated Escuchando PDF ({} bytes, {} nodes)", pdf.length,
                request.getNodes() == null ? 0 : request.getNodes().size());
        return new ResponseEntity<>(pdf, headers, 200);
    }
}
