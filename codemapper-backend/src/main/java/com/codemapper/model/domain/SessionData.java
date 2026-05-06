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

    private String sessionId;
    private Path projectPath;
    private String projectName;
    private int totalFiles;
    private Instant createdAt;
    private Status status;
    private boolean ownsFiles;
    private boolean pro;

    private final List<ParsedClass> parsedClasses = new CopyOnWriteArrayList<>();
    private final List<Connection> connections = new CopyOnWriteArrayList<>();
}
