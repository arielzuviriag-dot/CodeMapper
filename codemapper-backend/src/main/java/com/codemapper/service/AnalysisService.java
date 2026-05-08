package com.codemapper.service;

import com.codemapper.exception.SessionNotFoundException;
import com.codemapper.model.domain.ParsedClass;
import com.codemapper.model.domain.SessionData;
import com.codemapper.model.dto.AnalyzeResponse;
import com.codemapper.model.dto.ClassSourceResponse;
import com.codemapper.model.event.BaseEvent;
import com.codemapper.model.event.ErrorEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.FileSystemUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.function.Consumer;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisService {

    private static final long SSE_TIMEOUT_MS = 600_000L;

    private final SessionService sessionService;
    private final ZipService zipService;
    private final GitService gitService;
    private final JavaParserService javaParserService;
    private final FocusTracerService focusTracerService;
    private final FocusMethodTracerService focusMethodTracerService;
    private final ImpactAnalysisService impactAnalysisService;
    private final ExecutorService analysisExecutor;

    @Value("${codemapper.upload-dir:./tmp-uploads}")
    private String uploadDirConfig;

    public AnalyzeResponse handleUpload(MultipartFile file, boolean isPro) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file is empty");
        }
        String original = file.getOriginalFilename();
        if (original == null || original.isBlank()) {
            throw new IllegalArgumentException("Uploaded file has no name");
        }
        String lower = original.toLowerCase();

        Path workDir = uploadDir().resolve(UUID.randomUUID().toString());
        Files.createDirectories(workDir);

        try {
            Path projectRoot;
            String projectName;
            int totalFiles;

            if (lower.endsWith(".java")) {
                Path target = workDir.resolve(safeFileName(original));
                try (InputStream in = file.getInputStream()) {
                    Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
                }
                projectRoot = workDir;
                projectName = stripExtension(safeFileName(original));
                totalFiles = 1;
            } else if (lower.endsWith(".zip")) {
                try (InputStream in = file.getInputStream()) {
                    zipService.extract(in, workDir);
                }
                Optional<Path> pom = ProjectInfoUtils.findClosestPom(workDir);
                if (pom.isEmpty()) {
                    throw new IllegalArgumentException("ZIP must contain at least one pom.xml");
                }
                projectRoot = pom.get().getParent();
                projectName = ProjectInfoUtils.deriveName(projectRoot, pom.get());
                totalFiles = ProjectInfoUtils.countJavaFiles(projectRoot);
            } else {
                throw new IllegalArgumentException("Only .java or .zip files are accepted");
            }

            SessionData session = sessionService.createSession(projectRoot, projectName, totalFiles, true, isPro);
            return new AnalyzeResponse(session.getSessionId(), projectName, totalFiles);

        } catch (RuntimeException | IOException e) {
            safeDelete(workDir);
            throw e;
        }
    }

    public AnalyzeResponse handlePath(String absolutePath, boolean isPro) throws IOException {
        // ENDPOINT DE DESARROLLO LOCAL — no exponer en producción
        if (absolutePath == null || absolutePath.isBlank()) {
            throw new IllegalArgumentException("absolutePath is required");
        }
        Path root = Path.of(absolutePath);
        if (!Files.exists(root)) {
            throw new FileNotFoundException("Path does not exist: " + absolutePath);
        }
        if (!Files.isDirectory(root)) {
            throw new IllegalArgumentException("Path is not a directory: " + absolutePath);
        }
        if (!Files.isReadable(root)) {
            throw new IllegalArgumentException("Path is not readable: " + absolutePath);
        }

        Path pom = ProjectInfoUtils.findClosestPom(root).orElse(null);
        String projectName = ProjectInfoUtils.deriveName(root, pom);
        int totalFiles = ProjectInfoUtils.countJavaFiles(root);

        SessionData session = sessionService.createSession(root.toAbsolutePath().normalize(),
                projectName, totalFiles, false, isPro);
        return new AnalyzeResponse(session.getSessionId(), projectName, totalFiles);
    }

    public AnalyzeResponse handleFocus(String absoluteProjectPath, String focusRelativeFile, boolean isPro)
            throws IOException {
        if (absoluteProjectPath == null || absoluteProjectPath.isBlank()) {
            throw new IllegalArgumentException("projectPath is required");
        }
        if (focusRelativeFile == null || focusRelativeFile.isBlank()) {
            throw new IllegalArgumentException("focusFile is required");
        }
        Path root = Path.of(absoluteProjectPath).toAbsolutePath().normalize();
        if (!Files.exists(root)) {
            throw new FileNotFoundException("Project path does not exist: " + absoluteProjectPath);
        }
        if (!Files.isDirectory(root)) {
            throw new IllegalArgumentException("Project path is not a directory: " + absoluteProjectPath);
        }
        if (!Files.isReadable(root)) {
            throw new IllegalArgumentException("Project path is not readable: " + absoluteProjectPath);
        }

        Path focus = root.resolve(focusRelativeFile).normalize();
        if (!focus.startsWith(root)) {
            throw new IllegalArgumentException("focusFile must live inside projectPath");
        }
        if (!Files.exists(focus) || !Files.isRegularFile(focus)) {
            throw new FileNotFoundException("Focus file does not exist: " + focus);
        }
        if (!focus.getFileName().toString().endsWith(".java")) {
            throw new IllegalArgumentException("Focus file must be a .java file: " + focus);
        }

        Path pom = ProjectInfoUtils.findClosestPom(root).orElse(null);
        String projectName = ProjectInfoUtils.deriveName(root, pom);
        int totalFiles = ProjectInfoUtils.countJavaFiles(root);

        SessionData session = sessionService.createSession(root, projectName, totalFiles, false, isPro);
        session.setMode(SessionData.Mode.FOCUS);
        session.setFocusFile(focus);
        return new AnalyzeResponse(session.getSessionId(), projectName, totalFiles);
    }

    public AnalyzeResponse handleFocusMethod(String absoluteProjectPath,
                                              String focusRelativeFile,
                                              String methodName,
                                              boolean isPro) throws IOException {
        if (methodName == null || methodName.isBlank()) {
            throw new IllegalArgumentException("methodName is required");
        }
        // Reuse the same path validation as handleFocus, then layer the method
        // info on top before returning the response.
        AnalyzeResponse base = handleFocus(absoluteProjectPath, focusRelativeFile, isPro);
        SessionData session = sessionService.getSession(base.getSessionId());
        session.setMode(SessionData.Mode.FOCUS_METHOD);
        session.setFocusMethodName(methodName.trim());
        return base;
    }

    public AnalyzeResponse handleGithub(String repoUrl, boolean isPro) throws Exception {
        if (repoUrl == null || repoUrl.isBlank()) {
            throw new IllegalArgumentException("repoUrl is required");
        }
        Path workDir = uploadDir().resolve(UUID.randomUUID().toString());
        try {
            gitService.clone(repoUrl, workDir);

            Path pom = ProjectInfoUtils.findClosestPom(workDir).orElse(null);
            Path projectRoot = pom != null ? pom.getParent() : workDir;
            String projectName = ProjectInfoUtils.deriveName(projectRoot, pom);
            int totalFiles = ProjectInfoUtils.countJavaFiles(projectRoot);

            SessionData session = sessionService.createSession(projectRoot, projectName, totalFiles, true, isPro);
            return new AnalyzeResponse(session.getSessionId(), projectName, totalFiles);
        } catch (Exception e) {
            safeDelete(workDir);
            throw e;
        }
    }

    public SseEmitter openStream(String sessionId) {
        SessionData session = sessionService.getSession(sessionId);

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitter.onCompletion(() -> log.info("SSE completed for session {}", sessionId));
        emitter.onTimeout(() -> {
            log.warn("SSE timeout for session {}", sessionId);
            emitter.complete();
        });
        emitter.onError(t -> log.warn("SSE error for session {}: {}", sessionId, t.getMessage()));

        analysisExecutor.execute(() -> {
            try {
                Consumer<BaseEvent> sink = event -> {
                    try {
                        emitter.send(SseEmitter.event()
                                .name(event.eventName())
                                .data(event));
                    } catch (IOException e) {
                        log.warn("Could not send SSE event '{}' for session {}: {}",
                                event.eventName(), sessionId, e.getMessage());
                    }
                };
                switch (session.getMode()) {
                    case FOCUS_METHOD ->
                            focusMethodTracerService.traceMethod(session, sink);
                    case FOCUS ->
                            focusTracerService.traceFocus(session, sink);
                    case FULL ->
                            javaParserService.parseProject(session, sink);
                }
                emitter.complete();
            } catch (Exception ex) {
                log.error("Analysis failed for session {}", sessionId, ex);
                session.setStatus(SessionData.Status.FAILED);
                try {
                    emitter.send(SseEmitter.event()
                            .name("error")
                            .data(new ErrorEvent("Analysis failed: " + ex.getMessage(), null, null)));
                } catch (IOException ignored) {
                    // emitter may already be closed
                }
                emitter.completeWithError(ex);
            }
        });

        return emitter;
    }

    public ClassSourceResponse getClassSource(String sessionId, String classId) throws IOException {
        SessionData session = sessionService.getSession(sessionId);
        ParsedClass clazz = session.getParsedClasses().stream()
                .filter(c -> c.getId().equals(classId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Class '" + classId + "' not found in session " + sessionId));

        Path file = Path.of(clazz.getFilePath());
        if (!Files.exists(file)) {
            throw new FileNotFoundException("Source file missing: " + clazz.getFilePath());
        }
        String source = Files.readString(file);
        return new ClassSourceResponse(
                clazz.getName(),
                clazz.getPackageName(),
                clazz.getFullyQualifiedName(),
                source,
                clazz.getFilePath(),
                clazz.getLineCount());
    }

    public boolean deleteSession(String sessionId) {
        boolean removed = sessionService.deleteSession(sessionId);
        if (!removed) {
            throw new SessionNotFoundException(sessionId);
        }
        return true;
    }

    private Path uploadDir() throws IOException {
        Path p = Path.of(uploadDirConfig).toAbsolutePath().normalize();
        Files.createDirectories(p);
        return p;
    }

    private void safeDelete(Path dir) {
        try {
            if (Files.exists(dir)) {
                FileSystemUtils.deleteRecursively(dir);
            }
        } catch (IOException e) {
            log.warn("Could not delete temp dir {}: {}", dir, e.getMessage());
        }
    }

    private String safeFileName(String name) {
        return name.replaceAll("[^A-Za-z0-9._\\-]", "_");
    }

    private String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    /**
     * F4 — compute the transitive impact of changing the focus class. Re-walks
     * the project's java sources to build the inverse callgraph, runs BFS, and
     * returns counts (and, for PRO sessions, the full FQN lists). FREE sessions
     * get only the counters and the cycle flag — the lists come back empty,
     * which is what gates the simulate-change overlay on the frontend.
     */
    public com.codemapper.model.dto.ImpactReport computeImpact(String sessionId, int depth) throws IOException {
        SessionData session = sessionService.getSession(sessionId);
        String focusFqn = session.getParsedClasses().stream()
                .findFirst()
                .map(ParsedClass::getFullyQualifiedName)
                .orElse(null);
        return impactAnalysisService.computeImpact(session, focusFqn, depth);
    }
}
