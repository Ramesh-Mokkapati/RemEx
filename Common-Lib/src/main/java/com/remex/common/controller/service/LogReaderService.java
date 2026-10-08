package com.remex.common.controller.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class LogReaderService {

    private static final Logger logger = LoggerFactory.getLogger(LogReaderService.class);

    @Value("${logging.files.dir}")
    private String logFilesDir;

    // @Value injection happens after the constructor — log only once Spring has
    // populated the field, otherwise logFilesDir is always null here.
    @PostConstruct
    public void init() {
        logger.info("Using log files Dir: {}", logFilesDir);
    }

    public List<String> getLogs() throws IOException {
        if (logFilesDir == null || logFilesDir.trim().isEmpty()) {
            logger.warn("logging.files.dir is not configured — returning empty log list.");
            return Collections.emptyList();
        }

        Path dir = Paths.get(logFilesDir);
        if (!Files.exists(dir) || !Files.isDirectory(dir)) {
            logger.warn("Log directory does not exist: {} — returning empty log list.", logFilesDir);
            return Collections.emptyList();
        }

        try (Stream<Path> logFilesStream = Files.list(dir)) {
            return logFilesStream
                    .filter(Files::isRegularFile)
                    .filter(path -> path.toString().endsWith(".log"))
                    .sorted(Collections.reverseOrder())
                    .flatMap(this::readFileLines)
                    .collect(Collectors.toList());
        }
    }

    private Stream<String> readFileLines(Path path) {
        try {
            // ISO-8859-1 maps all 256 byte values, so it never throws
            // MalformedInputException regardless of the file's actual encoding.
            return Files.lines(path, StandardCharsets.ISO_8859_1);
        } catch (IOException e) {
            logger.error("Failed to read logs from file path: {}", path);
            throw new RuntimeException(e);
        }
    }
}
