package com.codemapper.controller;

import com.codemapper.model.dto.AnalyzeFocusMethodRequest;
import com.codemapper.model.dto.AnalyzeFocusRequest;
import com.codemapper.model.dto.AnalyzeGithubRequest;
import com.codemapper.model.dto.AnalyzePathRequest;
import com.codemapper.model.dto.AnalyzeResponse;
import com.codemapper.model.dto.ClassSourceResponse;
import com.codemapper.model.dto.ImpactReport;
import com.codemapper.service.AnalysisService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/analyze")
@RequiredArgsConstructor
public class AnalyzeController {

    private final AnalysisService analysisService;

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AnalyzeResponse> upload(@RequestParam("file") MultipartFile file,
                                                  @RequestParam(value = "demoMode", required = false) String demoMode)
            throws IOException {
        boolean isPro = isProMode(demoMode);
        log.info("Upload received: {} ({} bytes) [demoMode={}]",
                file.getOriginalFilename(), file.getSize(), demoMode);
        return ResponseEntity.ok(analysisService.handleUpload(file, isPro));
    }

    @PostMapping(value = "/path", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AnalyzeResponse> analyzePath(@Valid @RequestBody AnalyzePathRequest request)
            throws IOException {
        // ENDPOINT DE DESARROLLO LOCAL — no exponer en producción
        boolean isPro = isProMode(request.getDemoMode());
        log.info("Analyze path request: {} [demoMode={}]", request.getAbsolutePath(), request.getDemoMode());
        return ResponseEntity.ok(analysisService.handlePath(request.getAbsolutePath(), isPro));
    }

    @PostMapping(value = "/github", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AnalyzeResponse> analyzeGithub(@Valid @RequestBody AnalyzeGithubRequest request)
            throws Exception {
        boolean isPro = isProMode(request.getDemoMode());
        log.info("Analyze GitHub request: {} [demoMode={}]", request.getRepoUrl(), request.getDemoMode());
        return ResponseEntity.ok(analysisService.handleGithub(request.getRepoUrl(), isPro));
    }

    @PostMapping(value = "/focus", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AnalyzeResponse> analyzeFocus(@Valid @RequestBody AnalyzeFocusRequest request)
            throws IOException {
        boolean isPro = isProMode(request.getDemoMode());
        log.info("Analyze FOCUS request: project={} focus={} [demoMode={}]",
                request.getProjectPath(), request.getFocusFile(), request.getDemoMode());
        return ResponseEntity.ok(analysisService.handleFocus(
                request.getProjectPath(),
                request.getFocusFile(),
                isPro));
    }

    @PostMapping(value = "/focus-method", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AnalyzeResponse> analyzeFocusMethod(
            @Valid @RequestBody AnalyzeFocusMethodRequest request) throws IOException {
        boolean isPro = isProMode(request.getDemoMode());
        log.info("Analyze FOCUS METHOD request: project={} focus={} method={} [demoMode={}]",
                request.getProjectPath(), request.getFocusFile(), request.getMethodName(),
                request.getDemoMode());
        return ResponseEntity.ok(analysisService.handleFocusMethod(
                request.getProjectPath(),
                request.getFocusFile(),
                request.getMethodName(),
                isPro));
    }

    private boolean isProMode(String demoMode) {
        return demoMode != null && "pro".equalsIgnoreCase(demoMode.trim());
    }

    @GetMapping(value = "/stream/{sessionId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String sessionId) {
        log.info("SSE stream requested for session {}", sessionId);
        try {
            return analysisService.openStream(sessionId);
        } catch (com.codemapper.exception.SessionNotFoundException ex) {
            // SSE endpoint — we can't fall through to GlobalExceptionHandler
            // because that one tries to serialize JSON and the client asked
            // for text/event-stream (HttpMediaTypeNotAcceptableException).
            // Instead, return a short-lived emitter that ships one error
            // event and completes — the frontend already listens to the
            // "error" event and renders a clean message.
            log.warn("Session {} not found — returning SSE error event", sessionId);
            SseEmitter emitter = new SseEmitter(5_000L);
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data(java.util.Map.of(
                                "message", "Session not found: " + sessionId,
                                "code", "SESSION_NOT_FOUND")));
            } catch (IOException ignored) {
                // Client may have hung up already.
            }
            emitter.complete();
            return emitter;
        }
    }

    @GetMapping("/source/{sessionId}/{classId}")
    public ResponseEntity<ClassSourceResponse> getSource(@PathVariable String sessionId,
                                                         @PathVariable String classId) throws IOException {
        return ResponseEntity.ok(analysisService.getClassSource(sessionId, classId));
    }

    /**
     * F4 — "Simular cambio". Returns transitive impact of changing the focus
     * class: counts of affected classes/tests, cycle flag, and (PRO only) the
     * full FQN lists driving the highlight overlay on the frontend.
     *
     * @param depth max BFS depth (1–6). Default 4 — empirically the sweet
     *              spot between visible scope and walk cost.
     */
    @GetMapping("/focus/{sessionId}/impact")
    public ResponseEntity<ImpactReport> getImpact(@PathVariable String sessionId,
                                                  @RequestParam(value = "depth", defaultValue = "4") int depth)
            throws IOException {
        int clamped = Math.max(1, Math.min(6, depth));
        log.info("Impact analysis requested for session {} (depth={})", sessionId, clamped);
        return ResponseEntity.ok(analysisService.computeImpact(sessionId, clamped));
    }

    @DeleteMapping("/session/{sessionId}")
    public ResponseEntity<Map<String, Object>> deleteSession(@PathVariable String sessionId) {
        analysisService.deleteSession(sessionId);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("deleted", true);
        body.put("sessionId", sessionId);
        return ResponseEntity.ok(body);
    }
}
