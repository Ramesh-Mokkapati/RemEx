package com.remex.RemExService.controllers;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.remex.common.helpers.RequestHelper;
import com.remex.common.models.EventLog;
import com.remex.common.service.MessageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/rmxrsms")
public class ServiceController {

    private static final Logger logger = LoggerFactory.getLogger(ServiceController.class);

    /** Allowlist for Windows service names to prevent command injection. */
    private static final Pattern SAFE_SERVICE_NAME = Pattern.compile("^[\\w\\-\\.\\s]{1,256}$");

    @Autowired
    private HttpServletRequest request;

    @Autowired
    private MessageService messageService;

    // -----------------------------------------------------------------------
    // List all Windows services
    // -----------------------------------------------------------------------

    @GetMapping(path = "/services", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getServices() {
        String ps = "Get-Service | Select-Object Name,DisplayName,"
                + "@{N='Status';E={$_.Status.ToString()}} | ConvertTo-Json -Compress";
        try {
            String output = runPowerShell(ps);
            if (output == null || output.trim().isEmpty()) {
                return ResponseEntity.ok(Collections.emptyList());
            }

            // PowerShell returns an object (not array) when only one result — normalise.
            String json = output.trim();
            if (!json.startsWith("[")) {
                json = "[" + json + "]";
            }

            ObjectMapper mapper = new ObjectMapper();
            List<Map<String, Object>> services = mapper.readValue(
                    json, new TypeReference<List<Map<String, Object>>>() {});

            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(
                    request.getRemoteHost(), rh.getJWT_Token(), rh.GetUserNameFromJWT(),
                    "Listed Windows services"));

            return ResponseEntity.ok(services);

        } catch (IOException e) {
            logger.error("Failed to list Windows services", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to list services.");
        }
    }

    // -----------------------------------------------------------------------
    // Stop a Windows service
    // -----------------------------------------------------------------------

    @PostMapping(path = "/service/stop", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> stopService(@RequestParam String Name) {
        if (!SAFE_SERVICE_NAME.matcher(Name).matches()) {
            return ResponseEntity.badRequest().body("Invalid service name.");
        }
        try {
            String output = runPowerShell(
                    "Stop-Service -Name '" + Name + "' -Force -ErrorAction Stop; 'OK'");
            audit("Stopped Windows service: " + Name);
            return ResponseEntity.ok(output != null ? output.trim() : "Stopped");
        } catch (IOException e) {
            logger.error("Failed to stop service '{}'", Name, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to stop service.");
        }
    }

    // -----------------------------------------------------------------------
    // Start a Windows service
    // -----------------------------------------------------------------------

    @PostMapping(path = "/service/start", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> startService(@RequestParam String Name) {
        if (!SAFE_SERVICE_NAME.matcher(Name).matches()) {
            return ResponseEntity.badRequest().body("Invalid service name.");
        }
        try {
            String output = runPowerShell(
                    "Start-Service -Name '" + Name + "' -ErrorAction Stop; 'OK'");
            audit("Started Windows service: " + Name);
            return ResponseEntity.ok(output != null ? output.trim() : "Started");
        } catch (IOException e) {
            logger.error("Failed to start service '{}'", Name, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to start service.");
        }
    }

    // -----------------------------------------------------------------------
    // Restart a Windows service
    // -----------------------------------------------------------------------

    @PostMapping(path = "/service/restart", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> restartService(@RequestParam String Name) {
        if (!SAFE_SERVICE_NAME.matcher(Name).matches()) {
            return ResponseEntity.badRequest().body("Invalid service name.");
        }
        try {
            String output = runPowerShell(
                    "Restart-Service -Name '" + Name + "' -Force -ErrorAction Stop; 'OK'");
            audit("Restarted Windows service: " + Name);
            return ResponseEntity.ok(output != null ? output.trim() : "Restarted");
        } catch (IOException e) {
            logger.error("Failed to restart service '{}'", Name, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to restart service.");
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Runs a PowerShell command and returns all stdout lines joined.
     * Stderr is logged but not thrown — the caller inspects the returned string.
     */
    private String runPowerShell(String command) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(
                "powershell.exe", "-NoProfile", "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-Command", command);
        pb.redirectErrorStream(false);
        Process process = pb.start();

        // Read stdout
        String stdout;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            stdout = reader.lines().collect(Collectors.joining("\n"));
        }

        // Log stderr
        try (BufferedReader errReader = new BufferedReader(
                new InputStreamReader(process.getErrorStream()))) {
            String stderr = errReader.lines().collect(Collectors.joining("\n"));
            if (!stderr.trim().isEmpty()) {
                logger.warn("PowerShell stderr: {}", stderr);
                // Surface stderr to caller as an IOException so it reaches the HTTP 500 path
                throw new IOException(stderr.trim());
            }
        }

        return stdout;
    }

    private void audit(String action) {
        try {
            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(
                    request.getRemoteHost(), rh.getJWT_Token(), rh.GetUserNameFromJWT(),
                    action + " from " + request.getLocalName()));
        } catch (Exception e) {
            logger.warn("Audit event failed: {}", e.getMessage());
        }
    }
}
