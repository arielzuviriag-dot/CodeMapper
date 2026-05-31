package com.codemapper.model.domain;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Data
@NoArgsConstructor
public class SessionData {

    public enum Status {
        CREATED,
        PARSING,
        COMPLETED,
        FAILED
    }

    public enum Mode {
        FULL,
        FOCUS,
        FOCUS_METHOD,
        EXCEPTION
    }

    private String sessionId;
    private Path projectPath;
    private String projectName;
    private int totalFiles;
    private Instant createdAt;
    private Status status;
    private boolean ownsFiles;
    private boolean pro;
    private Mode mode = Mode.FULL;
    private Path focusFile;
    /** Method name to trace when mode == FOCUS_METHOD. */
    private String focusMethodName;
    /** Raw stack-trace text pasted by the user when mode == EXCEPTION. */
    private String stackTrace;
    /** Optional absolute path to a React Native project, used in EXCEPTION
     *  mode to link mobile screens → backend endpoints (URL ↔ @Mapping). */
    private String mobilePath;
    /** Optional absolute path to the front-end (web/React Native) project. In
     *  FULL mode the cross-stack linker scans it for HTTP calls and links
     *  screens → backend controllers (the "Aplicación" web layer). */
    private String frontendPath;
    /** "web" | "react-native" — front-end flavour the user picked. */
    private String frontendKind;
    /** Major Java version detected from pom.xml/build.gradle ("8","11","17","21").
     *  Null when no manifest could be parsed — parser falls back to BLEEDING_EDGE
     *  and per-feature compat checks treat unknown as "show everything supported". */
    private String detectedJavaVersion;

    private final List<ParsedClass> parsedClasses = new CopyOnWriteArrayList<>();
    private final List<Connection> connections = new CopyOnWriteArrayList<>();
}
