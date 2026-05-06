package com.codemapper.service;

import com.codemapper.exception.SessionNotFoundException;
import com.codemapper.model.domain.SessionData;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class SessionService {

    private final Map<String, SessionData> sessions = new ConcurrentHashMap<>();

    @Value("${codemapper.session-timeout-minutes:120}")
    private long sessionTimeoutMinutes;

    public SessionData createSession(Path projectPath, String projectName, int totalFiles,
                                     boolean ownsFiles, boolean pro) {
        SessionData data = new SessionData();
        data.setSessionId(UUID.randomUUID().toString());
        data.setProjectPath(projectPath);
        data.setProjectName(projectName);
        data.setTotalFiles(totalFiles);
        data.setCreatedAt(Instant.now());
        data.setStatus(SessionData.Status.CREATED);
        data.setOwnsFiles(ownsFiles);
        data.setPro(pro);
        sessions.put(data.getSessionId(), data);
        log.info("Created session {} for project '{}' ({} files, pro={}) at {}",
                data.getSessionId(), projectName, totalFiles, pro, projectPath);
        return data;
    }

    public SessionData getSession(String sessionId) {
        SessionData data = sessions.get(sessionId);
        if (data == null) {
            throw new SessionNotFoundException(sessionId);
        }
        return data;
    }

    public boolean deleteSession(String sessionId) {
        SessionData data = sessions.remove(sessionId);
        if (data == null) {
            return false;
        }
        if (data.isOwnsFiles() && data.getProjectPath() != null) {
            try {
                if (Files.exists(data.getProjectPath())) {
                    FileSystemUtils.deleteRecursively(data.getProjectPath());
                    log.info("Deleted temp directory for session {}: {}", sessionId, data.getProjectPath());
                }
            } catch (IOException e) {
                log.warn("Failed to delete temp directory for session {}: {}", sessionId, e.getMessage());
            }
        }
        log.info("Deleted session {}", sessionId);
        return true;
    }

    @Scheduled(fixedDelayString = "#{${codemapper.cleanup-interval-minutes:30} * 60 * 1000}")
    public void cleanupOldSessions() {
        Instant cutoff = Instant.now().minus(sessionTimeoutMinutes, ChronoUnit.MINUTES);
        sessions.values().stream()
                .filter(s -> s.getCreatedAt() != null && s.getCreatedAt().isBefore(cutoff))
                .map(SessionData::getSessionId)
                .toList()
                .forEach(id -> {
                    log.info("Cleanup: removing expired session {}", id);
                    deleteSession(id);
                });
    }
}
