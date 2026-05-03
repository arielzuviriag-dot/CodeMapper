package com.codemapper.service;

import lombok.extern.slf4j.Slf4j;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Slf4j
@Service
public class GitService {

    public void clone(String repoUrl, Path targetDir) throws GitAPIException, IOException {
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
}
