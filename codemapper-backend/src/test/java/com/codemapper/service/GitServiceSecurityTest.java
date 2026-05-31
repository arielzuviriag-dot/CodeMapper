package com.codemapper.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Fija la protección anti-SSRF de {@link GitService#validateRepoUrl}: ningún
 * esquema que no sea http(s), y ningún host loopback/interno, puede pasar.
 * Casos offline (no requieren red externa).
 */
class GitServiceSecurityTest {

    private final GitService git = new GitService();

    @Test
    void rejectsFileScheme() {
        assertThrows(IllegalArgumentException.class,
                () -> git.validateRepoUrl("file:///etc/passwd"));
    }

    @Test
    void rejectsSshScheme() {
        assertThrows(IllegalArgumentException.class,
                () -> git.validateRepoUrl("ssh://git@example.com/repo.git"));
    }

    @Test
    void rejectsGitScheme() {
        assertThrows(IllegalArgumentException.class,
                () -> git.validateRepoUrl("git://example.com/repo.git"));
    }

    @Test
    void rejectsLoopbackIp() {
        assertThrows(IllegalArgumentException.class,
                () -> git.validateRepoUrl("http://127.0.0.1/repo.git"));
    }

    @Test
    void rejectsLocalhost() {
        assertThrows(IllegalArgumentException.class,
                () -> git.validateRepoUrl("http://localhost:8080/repo.git"));
    }

    @Test
    void rejectsBlank() {
        assertThrows(IllegalArgumentException.class, () -> git.validateRepoUrl("   "));
    }
}
