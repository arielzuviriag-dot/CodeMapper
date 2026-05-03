package com.codemapper.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipArchiveInputStream;
import org.apache.commons.compress.utils.IOUtils;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Optional;
import java.util.stream.Stream;

@Slf4j
@Service
public class ZipService {

    public void extract(InputStream zipInput, Path targetDir) throws IOException {
        Files.createDirectories(targetDir);
        Path normalizedTarget = targetDir.toAbsolutePath().normalize();

        try (ZipArchiveInputStream zis = new ZipArchiveInputStream(zipInput)) {
            ZipArchiveEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                Path entryPath = normalizedTarget.resolve(entry.getName()).normalize();
                if (!entryPath.startsWith(normalizedTarget)) {
                    throw new IOException("Zip slip attempt detected: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(entryPath);
                } else {
                    if (entryPath.getParent() != null) {
                        Files.createDirectories(entryPath.getParent());
                    }
                    try (OutputStream out = Files.newOutputStream(entryPath)) {
                        IOUtils.copy(zis, out);
                    }
                }
            }
        }
        log.info("Extracted ZIP into {}", normalizedTarget);
    }

    public Optional<Path> findClosestPom(Path root) throws IOException {
        try (Stream<Path> stream = Files.walk(root)) {
            return stream
                    .filter(Files::isRegularFile)
                    .filter(p -> "pom.xml".equals(p.getFileName().toString()))
                    .min(Comparator.comparingInt(Path::getNameCount));
        }
    }
}
