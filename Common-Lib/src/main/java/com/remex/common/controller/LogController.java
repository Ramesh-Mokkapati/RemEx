package com.remex.common.controller;

import com.remex.common.controller.service.LogReaderService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;

@RestController
public class LogController {
    private final LogReaderService logReaderService;

    public LogController(LogReaderService logReaderService) {
        this.logReaderService = logReaderService;
    }

    @GetMapping("/logs")
    public List<String> getLogs() throws IOException {
        return logReaderService.getLogs();
    }
}
