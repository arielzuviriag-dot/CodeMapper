package com.codemapper.service;

import lombok.extern.slf4j.Slf4j;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.file.Files;
import java.nio.file.Path;

@Slf4j
@Service
public class GitService {

    public void clone(String repoUrl, Path targetDir) throws GitAPIException, IOException {
        validateRepoUrl(repoUrl);
        Files.createDirectories(targetDir);
        log.info("Cloning {} into {}", repoUrl, targetDir);
        try (Git git = Git.cloneRepository()
                .setURI(repoUrl)
                .setDirectory(targetDir.toFile())
                .setCloneAllBranches(false)
                .setNoCheckout(false)
                .call()) {
            log.info("Clone complete: {}", git.getRepository().getDirectory());
        }
    }

    /**
     * Anti-SSRF: solo se permiten repos http(s) hacia hosts públicos. Bloquea
     * {@code file://}/{@code ssh://}, loopback (localhost/127.0.0.1/::1) y
     * direcciones privadas/link-local/multicast — para que nadie use el clone
     * como puente hacia servicios internos o el filesystem del servidor.
     */
    void validateRepoUrl(String repoUrl) {
        if (repoUrl == null || repoUrl.isBlank()) {
            throw new IllegalArgumentException("La URL del repo es obligatoria");
        }
        URI uri;
        try {
            uri = URI.create(repoUrl.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("URL de repo inválida");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!scheme.equals("https") && !scheme.equals("http")) {
            throw new IllegalArgumentException(
                    "Solo se permiten repositorios http(s) (no file://, ssh, git://, etc.)");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("La URL del repo no tiene host");
        }
        try {
            for (InetAddress addr : InetAddress.getAllByName(host)) {
                if (addr.isLoopbackAddress() || addr.isAnyLocalAddress()
                        || addr.isSiteLocalAddress() || addr.isLinkLocalAddress()
                        || addr.isMulticastAddress()) {
                    throw new IllegalArgumentException(
                            "No se permiten repos en hosts internos o privados: " + host);
                }
            }
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("No se pudo resolver el host del repo: " + host);
        }
    }
}
