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
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Views and edits Windows environment variables.
 *
 * "Process" scope reflects RemExService's own live environment (read-only —
 * a running process's environment can't be changed from outside it).
 * "User" and "Machine" scope read/write the registry-backed environment via
 * PowerShell's [Environment] class, so changes there persist and are picked
 * up by any *new* process started after the change (existing processes,
 * including this one, won't see the update until they restart — the same
 * limitation System Properties > Environment Variables has in Windows).
 *
 * Writing to "Machine" scope requires RemExService to be running elevated
 * (Administrator); otherwise the registry write is denied and this returns
 * a 500 with the PowerShell error.
 */
@RestController
@RequestMapping("/v1/rmxrsms")
public class EnvironmentController {

    private static final Logger logger = LoggerFactory.getLogger(EnvironmentController.class);

    /** Windows environment variable names: letters/digits/underscore, not starting with a digit. */
    private static final Pattern SAFE_VAR_NAME = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]{0,254}$");
    private static final Set<String> VALID_SCOPES =
            new HashSet<>(Arrays.asList("Process", "User", "Machine"));
    private static final Set<String> MUTABLE_SCOPES =
            new HashSet<>(Arrays.asList("User", "Machine"));

    @Autowired
    private HttpServletRequest request;

    @Autowired
    private MessageService messageService;

    // -----------------------------------------------------------------------
    // List environment variables for a scope
    // -----------------------------------------------------------------------

    @GetMapping(path = "/envvars", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getEnvironmentVariables(@RequestParam(required = false, defaultValue = "Process") String Scope) {
        if (!VALID_SCOPES.contains(Scope)) {
            return ResponseEntity.badRequest().body("Scope must be one of: Process, User, Machine.");
        }
        try {
            Map<String, String> vars = "Process".equals(Scope)
                    ? new TreeMap<>(System.getenv())
                    : queryScope(Scope);
            audit("Listed " + Scope + " environment variables");
            return ResponseEntity.ok(vars);
        } catch (IOException e) {
            logger.error("Failed to list {} environment variables", Scope, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to list environment variables: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Create or update a User/Machine environment variable
    // -----------------------------------------------------------------------

    @PostMapping(path = "/envvars", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> setEnvironmentVariable(
            @RequestParam String Name,
            @RequestParam(required = false, defaultValue = "") String Value,
            @RequestParam(required = false, defaultValue = "User") String Scope) {

        if (!SAFE_VAR_NAME.matcher(Name).matches()) {
            return ResponseEntity.badRequest()
                    .body("Invalid variable name. Use letters, numbers, and underscores; it can't start with a digit.");
        }
        if (!MUTABLE_SCOPES.contains(Scope)) {
            return ResponseEntity.badRequest().body("Scope must be User or Machine to create or update a variable.");
        }
        try {
            runPowerShell("[Environment]::SetEnvironmentVariable('" + psEscape(Name) + "', '"
                    + psEscape(Value) + "', '" + Scope + "')");
            audit("Set " + Scope + " environment variable: " + Name);
            return ResponseEntity.ok("Saved");
        } catch (IOException e) {
            logger.error("Failed to set {} environment variable '{}'", Scope, Name, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to set environment variable: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Delete a User/Machine environment variable
    // -----------------------------------------------------------------------

    @DeleteMapping(path = "/envvars", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> deleteEnvironmentVariable(
            @RequestParam String Name,
            @RequestParam(required = false, defaultValue = "User") String Scope) {

        if (!SAFE_VAR_NAME.matcher(Name).matches()) {
            return ResponseEntity.badRequest().body("Invalid variable name.");
        }
        if (!MUTABLE_SCOPES.contains(Scope)) {
            return ResponseEntity.badRequest().body("Scope must be User or Machine to delete a variable.");
        }
        try {
            runPowerShell("[Environment]::SetEnvironmentVariable('" + psEscape(Name) + "', $null, '" + Scope + "')");
            audit("Deleted " + Scope + " environment variable: " + Name);
            return ResponseEntity.ok("Deleted");
        } catch (IOException e) {
            logger.error("Failed to delete {} environment variable '{}'", Scope, Name, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to delete environment variable: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private Map<String, String> queryScope(String scope) throws IOException {
        String output = runPowerShell(
                "[Environment]::GetEnvironmentVariables('" + scope + "') | ConvertTo-Json -Compress");
        if (output == null || output.trim().isEmpty() || output.trim().equals("null")) {
            return new TreeMap<>();
        }
        ObjectMapper mapper = new ObjectMapper();
        Map<String, String> raw = mapper.readValue(output.trim(), new TypeReference<Map<String, String>>() {});
        return new TreeMap<>(raw);
    }

    /** Escapes a value for embedding in a single-quoted PowerShell string literal. */
    private static String psEscape(String s) {
        return s == null ? "" : s.replace("'", "''");
    }

    /**
     * Runs a PowerShell command and returns all stdout lines joined.
     * Stderr is surfaced to the caller as an IOException (e.g. "Access is
     * denied" when writing Machine scope without elevation).
     */
    private String runPowerShell(String command) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(
                "powershell.exe", "-NoProfile", "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-Command", command);
        pb.redirectErrorStream(false);
        Process process = pb.start();

        String stdout;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            stdout = reader.lines().collect(Collectors.joining("\n"));
        }

        try (BufferedReader errReader = new BufferedReader(
                new InputStreamReader(process.getErrorStream()))) {
            String stderr = errReader.lines().collect(Collectors.joining("\n"));
            if (!stderr.trim().isEmpty()) {
                logger.warn("PowerShell stderr: {}", stderr);
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
